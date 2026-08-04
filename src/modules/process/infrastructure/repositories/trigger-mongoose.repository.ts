import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Trigger, TriggerDocument } from '../schemas/trigger.schema';
import { TriggerMapper } from '../schemas/mappers/trigger.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class TriggerMongooseRepository {

    public constructor(@InjectModel(Trigger.name) private triggerModel: Model<TriggerDocument>) { }

    public async create(model: TriggerModel): Promise<TriggerModel> {
        const created = await this.triggerModel.create(TriggerMapper.mapToSchema(model));
        return TriggerMapper.mapToModel(created);
    }

    public async upsert(id: string, model: TriggerModel): Promise<TriggerModel> {
        const saved = await this.triggerModel.findOneAndUpdate(
            { _id: id },
            TriggerMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return TriggerMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.triggerModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'trigger');
        }
        return true;
    }

    public async findById(id: string): Promise<TriggerModel> {
        const trigger = await this.triggerModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return trigger ? TriggerMapper.mapToModel(trigger) : null;
    }

    public async findAll(): Promise<TriggerModel[]> {
        const triggers = await this.triggerModel.find(NOT_DELETED_FILTER);
        return triggers.map(TriggerMapper.mapToModel);
    }

    public async findByCycleId(cycleId: string): Promise<TriggerModel[]> {
        const triggers = await this.triggerModel.find({ cycleId, ...NOT_DELETED_FILTER });
        return triggers.map(TriggerMapper.mapToModel);
    }

}
