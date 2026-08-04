import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Schedule, ScheduleDocument } from '../schemas/schedule.schema';
import { ScheduleMapper } from '../schemas/mappers/schedule.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class ScheduleMongooseRepository {

    public constructor(@InjectModel(Schedule.name) private scheduleModel: Model<ScheduleDocument>) { }

    public async create(model: ScheduleModel): Promise<ScheduleModel> {
        const created = await this.scheduleModel.create(ScheduleMapper.mapToSchema(model));
        return ScheduleMapper.mapToModel(created);
    }

    public async upsert(id: string, model: ScheduleModel): Promise<ScheduleModel> {
        const saved = await this.scheduleModel.findOneAndUpdate(
            { _id: id },
            ScheduleMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return ScheduleMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.scheduleModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'schedule');
        }
        return true;
    }

    public async findById(id: string): Promise<ScheduleModel> {
        const schedule = await this.scheduleModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return schedule ? ScheduleMapper.mapToModel(schedule) : null;
    }

    public async findAll(): Promise<ScheduleModel[]> {
        const schedules = await this.scheduleModel.find(NOT_DELETED_FILTER);
        return schedules.map(ScheduleMapper.mapToModel);
    }

    public async findByCycleId(cycleId: string): Promise<ScheduleModel[]> {
        const schedules = await this.scheduleModel.find({ cycleId, ...NOT_DELETED_FILTER });
        return schedules.map(ScheduleMapper.mapToModel);
    }

}
