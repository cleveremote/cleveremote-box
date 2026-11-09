import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InverterModel } from '@process/domain/models/inverter.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Inverter, InverterDocument } from '../schemas/inverter.schema';
import { InverterMapper } from '../schemas/mappers/inverter.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class InverterMongooseRepository {

    public constructor(@InjectModel(Inverter.name) private inverterModel: Model<InverterDocument>) { }

    public async create(model: InverterModel): Promise<InverterModel> {
        const created = await this.inverterModel.create(InverterMapper.mapToSchema(model));
        return InverterMapper.mapToModel(created);
    }

    public async upsert(id: string, model: InverterModel): Promise<InverterModel> {
        const saved = await this.inverterModel.findOneAndUpdate(
            { _id: id },
            InverterMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return InverterMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.inverterModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'inverter');
        }
        return true;
    }

    public async findById(id: string): Promise<InverterModel> {
        const inverter = await this.inverterModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return inverter ? InverterMapper.mapToModel(inverter) : null;
    }

    public async findAll(): Promise<InverterModel[]> {
        const inverters = await this.inverterModel.find(NOT_DELETED_FILTER);
        return inverters.map(InverterMapper.mapToModel);
    }

    public async findByDeviceId(deviceId: string): Promise<InverterModel[]> {
        const inverters = await this.inverterModel.find({ deviceId, ...NOT_DELETED_FILTER });
        return inverters.map(InverterMapper.mapToModel);
    }

}
