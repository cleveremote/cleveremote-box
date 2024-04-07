import { SunBehavior } from "@process/infrastructure/dto/synchronize.dto";

export class ScheduleModel {
    public id: string;
    public cycleId: string;
    public name: string;
    public description: string;
    public cron: { date?: Date; pattern?: string; sunBehavior?: SunBehavior; after?: number};
    public isPaused: boolean;
}