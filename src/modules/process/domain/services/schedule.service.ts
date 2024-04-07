/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable, Logger } from '@nestjs/common';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleModel } from '../models/schedule.model';
import { ProcessModel } from '../models/process.model';
import { ConfigurationService } from './configuration.service';
import { ExecutableAction, ProcessMode, ProcessType } from '../interfaces/executable.interface';
import { ProcessService } from './execution.service';

@Injectable()
export class ScheduleService {

    public constructor(private schedulerRegistry: SchedulerRegistry,
        private configurationService: ConfigurationService,
        private processService: ProcessService) {
    }

    public createSchedule(schedule: ScheduleModel, methode: () => void): void {

        const isExists = this.schedulerRegistry.doesExist('cron', schedule.id);
        if (isExists) {
            const job = this.schedulerRegistry.getCronJob(schedule.id);
            job.stop();
            this.schedulerRegistry.deleteCronJob(schedule.id);
        }
        try {
            const job = new CronJob(schedule.cron.date || schedule.cron.pattern, methode);
            this.schedulerRegistry.addCronJob(schedule.id, job);
            if (schedule.isPaused) {
                job.stop();
            } else {
                job.start();
            }
        } catch (e) {

        }

    }

    public deleteCronJob(scheduleId: string): void {
        const isExists = this.schedulerRegistry.doesExist('cron', scheduleId);
        if (isExists) {
            const job = this.schedulerRegistry.getCronJob(scheduleId);
            job.stop();
            this.schedulerRegistry.deleteCronJob(scheduleId);
        }
        Logger.warn(`job ${scheduleId} deleted!`);
    }

    public initSchedule(schedule: ScheduleModel, mode: ProcessMode = ProcessMode.SCHEDULED, type: ProcessType = ProcessType.FORCE): void {

        const process = new ProcessModel();
        process.cycle = this.configurationService.structure.cycles.find(x => x.id === schedule.cycleId);
        process.action = ExecutableAction.ON;
        process.type = type;
        process.mode = mode;
        process.schedule = schedule;
        const methode = async (): Promise<void> => {
            return this.processService.execute(process);
        };
        this.createSchedule(schedule, methode);
    }

    public restartAllSchedules(): void {
        const schedules = this.configurationService.schedules;
        const cycles = this.configurationService.getAllCyles();
        for (const key in schedules) {
            if (Object.prototype.hasOwnProperty.call(schedules, key)) {
                const schedule = schedules[key];
                const process = cycles.find(x => x.cycle.id === schedule.cycleId);
                process.action = ExecutableAction.ON;
                const methode = async (): Promise<void> => {
                    return this.processService.execute(process);
                };
                this.createSchedule(schedule, methode);
            }
        }
    }


}
