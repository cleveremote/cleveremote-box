/* eslint-disable max-lines-per-function */
import { TaskModel } from '@process/domain/models/task.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ScheduleEntity } from './schedule.entity';
import { TriggerEntity } from './trigger.entity';

export class TaskEntity extends TaskModel {

    public static mapToModel(taskEntity: TaskEntity): TaskModel {
        const task = new TaskModel();
        task.id = taskEntity.id;
        task.name = taskEntity.name;
        task.description = taskEntity.description;
        task.mapSectionId = taskEntity.mapSectionId;
        task.style = taskEntity.style;
        task.isActive = !!taskEntity.isActive;

        task.schedules = [];
        taskEntity.schedules?.forEach(scheduleData => {
            task.schedules.push(ScheduleEntity.mapToModel(scheduleData));
        });

        task.triggers = [];
        taskEntity.triggers?.forEach(triggerData => {
            task.triggers.push(TriggerEntity.mapToModel(triggerData));
        });

        return task;
    }

    public static mapToEntity(taskModel: TaskModel): TaskEntity {
        const task = new TaskEntity();
        task.id = taskModel.id;
        task.name = taskModel.name;
        task.description = taskModel.description;
        task.mapSectionId = taskModel.mapSectionId;
        task.style = taskModel.style;
        task.isActive = !!taskModel.isActive;

        task.schedules = [];
        taskModel.schedules?.forEach((scheduleData: ScheduleModel) => {
            task.schedules.push(ScheduleEntity.mapToEntity(scheduleData));
        });

        task.triggers = [];
        taskModel.triggers?.forEach((triggerData: TriggerModel) => {
            task.triggers.push(TriggerEntity.mapToEntity(triggerData));
        });

        return task;
    }

}
