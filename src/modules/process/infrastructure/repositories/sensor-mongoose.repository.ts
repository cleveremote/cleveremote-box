import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SensorModel } from '@process/domain/models/sensor.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Sensor, SensorDocument } from '../schemas/sensor.schema';
import { SensorMapper } from '../schemas/mappers/sensor.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class SensorMongooseRepository {

    public constructor(@InjectModel(Sensor.name) private sensorModel: Model<SensorDocument>) { }

    public async create(model: SensorModel): Promise<SensorModel> {
        const created = await this.sensorModel.create(SensorMapper.mapToSchema(model));
        return SensorMapper.mapToModel(created);
    }

    public async update(id: string, model: SensorModel): Promise<SensorModel> {
        const updated = await this.sensorModel.findByIdAndUpdate(id, SensorMapper.mapToSchema(model), { new: true });
        if (!updated) {
            throw new ElementNotFoundExeception(id, 'update', 'sensor');
        }
        return SensorMapper.mapToModel(updated);
    }

    public async upsert(id: string, model: SensorModel): Promise<SensorModel> {
        const saved = await this.sensorModel.findOneAndUpdate(
            { _id: id },
            SensorMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return SensorMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.sensorModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'sensor');
        }
        return true;
    }

    public async findById(id: string): Promise<SensorModel> {
        const sensor = await this.sensorModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return sensor ? SensorMapper.mapToModel(sensor) : null;
    }

    public async findAll(): Promise<SensorModel[]> {
        const sensors = await this.sensorModel.find(NOT_DELETED_FILTER);
        return sensors.map(SensorMapper.mapToModel);
    }

}
