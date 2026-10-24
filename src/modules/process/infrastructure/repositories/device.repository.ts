import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DeviceModel, DeviceType, SlaveConfigModel } from '@process/domain/models/device.model';
import { SynchronizeDeviceModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ModbusService } from '@process/domain/services/modbus.service';
import { DeviceMongooseRepository } from './device-mongoose.repository';
import { ActuatorRepository } from './actuator.repository';
import { ComRequestRepository } from './com-request.repository';
import { DeviceCommandRepository } from './device-command.repository';

@Injectable()
export class DeviceRepository {

    public constructor(
        private deviceMongooseRepository: DeviceMongooseRepository,
        private actuatorRepository: ActuatorRepository,
        private comRequestRepository: ComRequestRepository,
        private deviceCommandRepository: DeviceCommandRepository,
        @Inject(forwardRef(() => ModbusService)) private modbusService: ModbusService,
        private readonly logger: Logger
    ) { }

    public async save(model: DeviceModel): Promise<DeviceModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'device');
            }
            return this.deviceMongooseRepository.upsert(model._id, model);
        }
        return this.deviceMongooseRepository.create(model);
    }

    // cascade : soft-supprime les slaves (config.masterDeviceId), puis les actionneurs et
    // comrequests / commandes rattaches, avant le device lui-meme. Chaque slave concerne est d'abord remis sur
    // l'adresse d'origine de sa plage (cf ModbusService.resetSlaveAddress) : tous les resets sont
    // faits avant toute suppression, et un echec de reset annule la suppression (exception propagee).
    public async delete(id: string): Promise<boolean> {
        const device = await this.deviceMongooseRepository.findById(id);
        const slaves = await this.deviceMongooseRepository.findSlavesByMasterId(id);
        for (const slave of slaves) {
            await this._resetSlaveAddress(slave);
        }
        if (device?.type === DeviceType.SLAVE) {
            await this._resetSlaveAddress(device);
        }
        for (const slave of slaves) {
            await this._softDelete(slave._id);
        }
        return this._softDelete(id);
    }

    private async _softDelete(id: string): Promise<boolean> {
        await this.actuatorRepository.deleteForDevice(id);
        await this.comRequestRepository.deleteForDevice(id);
        await this.deviceCommandRepository.deleteForDevice(id);
        return this.deviceMongooseRepository.delete(id);
    }

    // un device n'est soft-supprime que s'il est explicitement marque `delete: true`.
    public async saveMany(models: SynchronizeDeviceModel[]): Promise<DeviceModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.delete(model._id);
                continue;
            }
            await this.save(model);
        }
        return this.deviceMongooseRepository.findAll();
    }

    // prioritaire sur la suppression : toute erreur (master introuvable, module injoignable) est propagee.
    private async _resetSlaveAddress(slave: DeviceModel): Promise<void> {
        const master = await this.deviceMongooseRepository.findById((slave.config as SlaveConfigModel).masterDeviceId);
        if (!master) {
            this.logger.error({ deviceId: slave._id }, 'slave address reset failed: master not found, deletion aborted');
            throw new Error(`slave address reset failed for device ${slave._id}: master not found`);
        }
        try {
            await this.modbusService.resetSlaveAddress(slave, master);
        } catch (err) {
            this.logger.error({ deviceId: slave._id, err: err instanceof Error ? err.message : String(err) }, 'slave address reset failed, deletion aborted');
            throw err;
        }
    }

    public async get(id?: string): Promise<DeviceModel | DeviceModel[]> {
        if (!id) {
            return this.deviceMongooseRepository.findAll();
        }
        return this.deviceMongooseRepository.findById(id);
    }

    public async getByType(type: DeviceType): Promise<DeviceModel[]> {
        return this.deviceMongooseRepository.findByType(type);
    }

    public async getSlavesByMasterId(masterDeviceId: string): Promise<DeviceModel[]> {
        return this.deviceMongooseRepository.findSlavesByMasterId(masterDeviceId);
    }

}
