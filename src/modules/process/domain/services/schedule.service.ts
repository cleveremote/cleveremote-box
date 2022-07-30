/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable, Logger } from '@nestjs/common';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleModel } from '../models/schedule.model';

@Injectable()
export class ScheduleService {

    public constructor(private schedulerRegistry: SchedulerRegistry) {
    }

    public createSchedule(schedule: ScheduleModel): void {
        const job = new CronJob(schedule.cron.date || schedule.cron.pattern, schedule.methode);
        this.schedulerRegistry.addCronJob(schedule.id, job);
        job.start();
    }

    public deleteCronJob(scheduleId: string): void {
        this.schedulerRegistry.deleteCronJob(scheduleId);
        Logger.warn(`job ${scheduleId} deleted!`);
    }

}
