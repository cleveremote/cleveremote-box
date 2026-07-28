import { Injectable } from '@nestjs/common';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { SynchronizeComRequestModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ComRequestkMongooseRepository } from './com-request-mongoose.repository';

@Injectable()
export class ComRequestRepository {

    public constructor(private comRequestMongooseRepository: ComRequestkMongooseRepository) { }

    public async save(model: ComRequestModel): Promise<ComRequestModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'modbusTask');
            }
            return this.comRequestMongooseRepository.upsert(model._id, model);
        }
        return this.comRequestMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        return this.comRequestMongooseRepository.delete(id);
    }

    // un modbusTask n'est soft-supprime que s'il est explicitement marque `delete: true`.
    public async saveMany(models: SynchronizeComRequestModel[]): Promise<ComRequestModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.comRequestMongooseRepository.delete(model._id);
                continue;
            }
            await this.save(model);
        }
        return this.comRequestMongooseRepository.findAll();
    }

    public async get(id?: string): Promise<ComRequestModel | ComRequestModel[]> {
        if (!id) {
            return this.comRequestMongooseRepository.findAll();
        }
        return this.comRequestMongooseRepository.findById(id);
    }

    public async getComRequestsByDeviceIdAndTypes(deviceId: string, types: ComRequestType[]): Promise<ComRequestModel[]> {
        return this.comRequestMongooseRepository.findByDeviceIdAndTypes(deviceId, types);
    }

    public async replaceAll(models: SynchronizeComRequestModel[]): Promise<ComRequestModel[]> {
        return this.saveMany(models);
    }

    // remplacement complet scope a un device : tout comrequest existant absent de `models` est
    // soft-supprime (cascade stricte, cf. box/synchronize/device avec comrequests imbriques).
    public async replaceForDevice(deviceId: string, models: SynchronizeComRequestModel[]): Promise<ComRequestModel[]> {
        const existing = await this.comRequestMongooseRepository.findByDeviceId(deviceId);
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
            model.deviceId = deviceId;
            await this.save(model);
        }
        return this.comRequestMongooseRepository.findByDeviceId(deviceId);
    }

}
