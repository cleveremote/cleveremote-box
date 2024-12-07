/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable, Logger } from '@nestjs/common';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleModel } from '../models/schedule.model';
import { ProcessModel } from '../models/process.model';
import { StructureService } from './configuration.service';
import { ExecutableAction, ProcessMode, ProcessType } from '../interfaces/executable.interface';
import { ProcessService } from './execution.service';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleEntity } from '@process/infrastructure/entities/cycle.entity';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { getSunrise, getSunset } from 'sunrise-sunset-js'
import { SunState } from '../interfaces/schedule.interface';

@Injectable()
export class ScheduleService {

    public constructor(
        private schedulerRegistry: SchedulerRegistry,
        private configurationService: StructureService,
        private processService: ProcessService,
        private cycleRepository: CycleRepository,
        private scheduleRepository: ScheduleRepository
    ) {
    }

    public createSchedule(schedule: ScheduleModel, methode: () => void): ScheduleModel {
        let job;
        const isExists = this.schedulerRegistry.doesExist('cron', schedule.id);
        if (isExists) {
            job = this.schedulerRegistry.getCronJob(schedule.id);
            job.stop();
            this.schedulerRegistry.deleteCronJob(schedule.id);
        }
        try {
            const coord = { lat: 34.100780850096896, long: -6.4666017095313935 }
            const sunBehavior = schedule.cron.sunBehavior;
            const executionDate = sunBehavior ? (sunBehavior.sunState === SunState.SUNRISE ? getSunset(coord.lat, coord.long, new Date()) : getSunrise(coord.lat, coord.long, new Date())).getTime() + sunBehavior.time : null;

            if (executionDate) {
                job = new CronJob(new Date(executionDate), methode);
            } else {
                job = new CronJob(schedule.cron.pattern, methode);
            }

            this.schedulerRegistry.addCronJob(schedule.id, job);
            if (schedule.isPaused) {
                job.stop();
            } else {
                job.start();
            }
        } catch (e) {

        }

        return schedule;

    }

    public async deleteCronJob(scheduleId: string): Promise<void> {
        const isExists = this.schedulerRegistry.doesExist('cron', scheduleId);
        if (isExists) {
            const job = this.schedulerRegistry.getCronJob(scheduleId);
            job.stop();
            this.schedulerRegistry.deleteCronJob(scheduleId);
            const schedule = this.configurationService.schedules.find(x => x.id === scheduleId);
            if (schedule) {
                await this.scheduleRepository.delete(scheduleId, schedule.cycleId);
            }

        }
        Logger.warn(`job ${scheduleId} deleted!`);
    }

    public async initSchedule(schedule: ScheduleModel, isDeleted: boolean = false,
        mode: ProcessMode = ProcessMode.SCHEDULED, type: ProcessType = ProcessType.INIT, overridedMethode?: () => void): Promise<ScheduleModel> {

        if (isDeleted) {
            const index = this.configurationService.schedules.findIndex(x => x.id === schedule.id);
            this.configurationService.schedules.splice(index, 1);
            await this.deleteCronJob(schedule.id);
            return schedule;
        }

        this.configurationService.schedules.push(schedule);
        let methode = overridedMethode;
        if (!methode) {
            const process = this.preapreScheduleProcess(schedule, mode, type);
            methode = async (): Promise<void> => {
                setTimeout(async () => {
                    await this.clearAllSchedules();
                    if (!process.schedule.isPaused) {
                        await this.processService.execute({...process});
                    }
                }, schedule.cron.sunBehavior ? 0 : schedule.cron.after);
            };
        }
        return this.createSchedule(schedule, methode);
    }

    public preapreScheduleProcess(schedule: ScheduleModel, mode: ProcessMode = ProcessMode.SCHEDULED,
        type: ProcessType = ProcessType.FORCE, action: ExecutableAction = ExecutableAction.ON): ProcessModel {
        const process = new ProcessModel();
        process.cycle = this.configurationService.structure.cycles.find(x => x.id === schedule.cycleId);
        process.action = action;
        process.type = ProcessType.INIT;
        process.mode = mode;
        process.schedule = schedule;
        return process;
    }

    public async restartAllSchedules(): Promise<void> {
        const schedules = this.configurationService.schedules;
        const cycles = (await this.cycleRepository.get()) as Array<CycleEntity>;
        for (const key in schedules) {
            if (Object.hasOwnProperty.call(schedules, key)) {
                const schedule = schedules[key];
                const cycle = cycles.find(cycle => cycle.id === schedule.cycleId);
                const cycleModel = CycleEntity.mapToModel(cycle);
                const process = new ProcessModel();
                process.cycle = cycleModel;
                process.action = ExecutableAction.ON;
                process.type = ProcessType.INIT;
                process.mode = ProcessMode.SCHEDULED;
                const methode = async (): Promise<void> => {
                    setTimeout(async () => {
                        await this.clearAllSchedules();
                        if (!schedule.isPaused) {
                            await this.processService.execute({...process}); 
                        }
                    }, schedule.cron.after);

                };
                this.createSchedule(schedule, methode);
            }
        }
    }

    public async clearAllSchedules(): Promise<void> {
        const jobs = this.schedulerRegistry.getCronJobs();
        for await (const job of jobs.entries()) {
            const key = job[0],
                value = job[1];
            try {
                value.nextDate().toJSDate();
            } catch (e) {
                await this.deleteCronJob(key);
            }
        }
    }


}
