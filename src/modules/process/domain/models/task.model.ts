import { ScheduleModel } from './schedule.model';
import { TriggerModel } from './trigger.model';

export class TaskModel {
    public id: string;
    public name: string;
    public description: string;
    public style: { bgColor: string; fontColor: string; iconColor: string };
    public mapSectionId: string;
    public isActive: boolean = false;
    public schedules: ScheduleModel[] = [];
    public triggers: TriggerModel[] = [];
}
