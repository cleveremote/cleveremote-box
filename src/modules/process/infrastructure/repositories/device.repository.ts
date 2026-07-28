import { Injectable } from '@nestjs/common';
import { DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { SynchronizeDeviceModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { DeviceMongooseRepository } from './device-mongoose.repository';

@Injectable()
export class DeviceRepository {

    public constructor(private deviceMongooseRepository: DeviceMongooseRepository) { }

    public async save(model: DeviceModel): Promise<DeviceModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'device');
            }
            return this.deviceMongooseRepository.upsert(model._id, model);
        }
        return this.deviceMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        return this.deviceMongooseRepository.delete(id);
    }

    // un device n'est soft-supprime que s'il est explicitement marque `delete: true`.
    public async saveMany(models: SynchronizeDeviceModel[]): Promise<DeviceModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.deviceMongooseRepository.delete(model._id);
                continue;
            }
            await this.save(model);
        }
        return this.deviceMongooseRepository.findAll();
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
