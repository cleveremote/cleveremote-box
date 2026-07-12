import { Injectable } from '@nestjs/common';
import { SensorModel } from '@process/domain/models/sensor.model';
import { SynchronizeSensorModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { SensorMongooseRepository } from './sensor-mongoose.repository';

@Injectable()
export class SensorRepository {

    public constructor(private sensorMongooseRepository: SensorMongooseRepository) { }

    public async save(model: SensorModel): Promise<SensorModel> {
        if (model.id) {
            if (!isValidUuid(model.id)) {
                throw new InvalidIdException(model.id, 'sensor');
            }
            return this.sensorMongooseRepository.upsert(model.id, model);
        }
        return this.sensorMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        return this.sensorMongooseRepository.delete(id);
    }

    public async get(id?: string): Promise<SensorModel | SensorModel[]> {
        if (!id) {
            return this.sensorMongooseRepository.findAll();
        }
        return this.sensorMongooseRepository.findById(id);
    }

    // un sensor n'est soft-supprime que s'il est explicitement marque `delete: true` dans
    // `models` ; un sensor absent de `models` reste inchange.
    public async replaceAll(models: SynchronizeSensorModel[]): Promise<SensorModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.sensorMongooseRepository.delete(model.id);
                continue;
            }
            await this.save(model);
        }
        return this.sensorMongooseRepository.findAll();
    }

}
