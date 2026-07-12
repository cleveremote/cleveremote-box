import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ComRequest, ComRequestDocument } from '../schemas/comrequest.schema';
import { ModbusTaskMapper } from '../schemas/mappers/modbus-task.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class ComRequestkMongooseRepository {

    public constructor(@InjectModel(ComRequest.name) private taskModel: Model<ComRequestDocument>) { }

    public async create(model: ComRequestModel): Promise<ComRequestModel> {
        const created = await this.taskModel.create(ModbusTaskMapper.mapToSchema(model));
        return ModbusTaskMapper.mapToModel(created);
    }

    public async update(id: string, model: ComRequestModel): Promise<ComRequestModel> {
        const updated = await this.taskModel.findByIdAndUpdate(id, ModbusTaskMapper.mapToSchema(model), { new: true });
        if (!updated) {
            throw new ElementNotFoundExeception(id, 'update', 'modbusTask');
        }
        return ModbusTaskMapper.mapToModel(updated);
    }

    public async upsert(id: string, model: ComRequestModel): Promise<ComRequestModel> {
        const saved = await this.taskModel.findOneAndUpdate(
            { _id: id },
            ModbusTaskMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return ModbusTaskMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.taskModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'modbusTask');
        }
        return true;
    }

    public async findById(id: string): Promise<ComRequestModel> {
        const task = await this.taskModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return task ? ModbusTaskMapper.mapToModel(task) : null;
    }

    public async findAll(): Promise<ComRequestModel[]> {
        const tasks = await this.taskModel.find(NOT_DELETED_FILTER);
        return tasks.map(ModbusTaskMapper.mapToModel);
    }

}
