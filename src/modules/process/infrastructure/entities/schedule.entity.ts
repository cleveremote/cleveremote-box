/* eslint-disable max-lines-per-function */
import { ScheduleModel } from '@process/domain/models/schedule.model';

export class ScheduleEntity extends ScheduleModel {

    public static mapToModel(scheduleEntity: ScheduleEntity): ScheduleModel {
        const schedule = new ScheduleModel();
        schedule.id = scheduleEntity.id;
        schedule.cycleId = scheduleEntity.cycleId;
        schedule.name = scheduleEntity.name;
        schedule.description = scheduleEntity.description;
        schedule.cron = scheduleEntity.cron;
        if (scheduleEntity.cron.date) { // no need nya
            schedule.cron.date = new Date(scheduleEntity.cron.date);
        }
        schedule.isPaused = scheduleEntity.isPaused;
        schedule.shouldConfirmation = scheduleEntity.shouldConfirmation;
        return schedule;
    }

    public static mapToEntity(scheduleModel: ScheduleModel): ScheduleEntity {
        const schedule = new ScheduleEntity();
        schedule.id = scheduleModel.id;
        schedule.cycleId = scheduleModel.cycleId;
        schedule.name = scheduleModel.name;
        schedule.description = scheduleModel.description;
        schedule.cron = scheduleModel.cron;
        schedule.isPaused = scheduleModel.isPaused;
        schedule.shouldConfirmation = scheduleModel.shouldConfirmation;
        return schedule;
    }

}

