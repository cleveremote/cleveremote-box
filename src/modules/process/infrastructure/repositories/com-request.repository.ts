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

}
