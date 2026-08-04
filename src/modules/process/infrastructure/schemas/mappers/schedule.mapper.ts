import { ScheduleModel } from '@process/domain/models/schedule.model';
import { Schedule, ScheduleDocument } from '../schedule.schema';

export class ScheduleMapper {

    public static mapToModel(schedule: ScheduleDocument): ScheduleModel {
        const model = new ScheduleModel();
        model._id = schedule._id;
        model.cycleId = schedule.cycleId;
        model.name = schedule.name;
        model.description = schedule.description;
        model.cron = schedule.cron;
        model.isPaused = schedule.isPaused;
        model.shouldConfirmation = schedule.shouldConfirmation;
        model.duration = schedule.duration;
        model.createdAt = (schedule as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (schedule as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = schedule.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: ScheduleModel): Schedule {
        const schedule = new Schedule();
        schedule.cycleId = model.cycleId;
        schedule.name = model.name;
        schedule.description = model.description;
        schedule.cron = model.cron;
        schedule.isPaused = model.isPaused;
        schedule.shouldConfirmation = model.shouldConfirmation;
        schedule.duration = model.duration;
        return schedule;
    }

}
