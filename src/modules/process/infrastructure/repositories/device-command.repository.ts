import { Injectable } from '@nestjs/common';
import { DeviceCommandModel, DeviceCommandType } from '@process/domain/models/device-command.model';
import { SynchronizeDeviceCommandModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { DeviceCommandMongooseRepository } from './device-command-mongoose.repository';

@Injectable()
export class DeviceCommandRepository {

    public constructor(private deviceCommandMongooseRepository: DeviceCommandMongooseRepository) { }

    public async save(model: DeviceCommandModel): Promise<DeviceCommandModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'deviceCommand');
            }
            return this.deviceCommandMongooseRepository.upsert(model._id, model);
        }
        return this.deviceCommandMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        return this.deviceCommandMongooseRepository.delete(id);
    }

    // une commande n'est soft-supprimee que si elle est explicitement marquee `delete: true`.
    public async saveMany(models: SynchronizeDeviceCommandModel[]): Promise<DeviceCommandModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.deviceCommandMongooseRepository.delete(model._id);
                continue;
            }
            await this.save(model);
        }
        return this.deviceCommandMongooseRepository.findAll();
    }

    public async get(id?: string): Promise<DeviceCommandModel | DeviceCommandModel[]> {
        if (!id) {
            return this.deviceCommandMongooseRepository.findAll();
        }
        return this.deviceCommandMongooseRepository.findById(id);
    }

    public async getByIds(ids: string[]): Promise<DeviceCommandModel[]> {
        return this.deviceCommandMongooseRepository.findByIds(ids);
    }

    public async getByModelId(modelId: string): Promise<DeviceCommandModel[]> {
        return this.deviceCommandMongooseRepository.findByModelId(modelId);
    }

    public async getCommandsByType(modelId: string, type: DeviceCommandType): Promise<DeviceCommandModel[]> {
        return this.deviceCommandMongooseRepository.findByModelIdAndType(modelId, type);
    }

    // remplacement complet scope a un modele : toute commande existante absente de `models` est
    // soft-supprimee.
    public async replaceForModel(modelId: string, models: SynchronizeDeviceCommandModel[]): Promise<DeviceCommandModel[]> {
        const existing = await this.deviceCommandMongooseRepository.findByModelId(modelId);
        const incomingIds = new Set(models.filter(model => model._id).map(model => model._id));
        for (const item of existing) {
            if (!incomingIds.has(item._id)) {
                await this.delete(item._id);
            }
        }
        for (const model of models) {
            if (model.delete) {
                await this.delete(model._id);
                continue;
            }
            model.modelId = modelId;
            await this.save(model);
        }
        return this.deviceCommandMongooseRepository.findByModelId(modelId);
    }

}
