/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleModel } from '../models/schedule.model';
import { ProcessModel } from '../models/process.model';
import { StructureService } from './configuration.service';
import { ExecutableAction, ProcessMode, ProcessType } from '../interfaces/executable.interface';
import { ProcessService } from './execution.service';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleModel } from '../models/cycle.model';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { getSunrise, getSunset } from 'sunrise-sunset-js'
import { SunState } from '../interfaces/schedule.interface';

@Injectable()
export class ScheduleService {

    public constructor(
        private schedulerRegistry: SchedulerRegistry,
        private configurationService: StructureService,
        @Inject(forwardRef(() => ProcessService)) private processService: ProcessService,
        private cycleRepository: CycleRepository,
        private scheduleRepository: ScheduleRepository,
        private readonly logger: Logger
    ) {
    }

    public createSchedule(schedule: ScheduleModel, methode: () => void): ScheduleModel {
        let job;
        const isExists = this.schedulerRegistry.doesExist('cron', schedule._id);
        if (isExists) {
            job = this.schedulerRegistry.getCronJob(schedule._id);
            job.stop();
            this.schedulerRegistry.deleteCronJob(schedule._id);
        }
        try {
            const coord = { lat: 34.100780850096896, long: -6.4666017095313935 }
            const sunBehavior = schedule.cron.sunBehavior;
            const executionDate = sunBehavior ? (sunBehavior.sunState === SunState.SUNRISE ? getSunset(coord.lat, coord.long, new Date()) : getSunrise(coord.lat, coord.long, new Date())).getTime() + sunBehavior.time : null;

            if (executionDate) { 
                job = new CronJob(new Date(executionDate), methode);
            } else {  
                const now = new Date();
                job = new CronJob(schedule.cron.pattern || new Date(now.getTime() + 10000), methode);
            }

            this.schedulerRegistry.addCronJob(schedule._id, job);
            if (schedule.isPaused) {
                job.stop();
            } else {
                job.start();
            }
        } catch (e) {
            this.logger.error({ error: e }, 'createSchedule failed');
        }

        return schedule;

    }

    public async setPaused(schedule: ScheduleModel, isPaused: boolean): Promise<ScheduleModel> {
        if (schedule.isPaused === isPaused) { return schedule; }
        const saved = await this.scheduleRepository.save({ ...schedule, isPaused });
        const index = this.configurationService.schedules.findIndex(x => x._id === schedule._id);
        if (index !== -1) { this.configurationService.schedules[index] = saved; }
        if (this.schedulerRegistry.doesExist('cron', schedule._id)) {
            const job = this.schedulerRegistry.getCronJob(schedule._id);
            isPaused ? job.stop() : job.start();
        } else if (!isPaused) {
            await this.initSchedule(saved, false, ProcessMode.SCHEDULED, ProcessType.INIT);
        }
        return saved;
    }

    public async deleteCronJob(scheduleId: string): Promise<void> {
        const isExists = this.schedulerRegistry.doesExist('cron', scheduleId);
        if (isExists) {
            const job = this.schedulerRegistry.getCronJob(scheduleId);
            job.stop();
            this.schedulerRegistry.deleteCronJob(scheduleId);
            const schedule = this.configurationService.schedules.find(x => x._id === scheduleId);
            if (schedule) {
                await this.scheduleRepository.delete(scheduleId);
            }

        }
        this.logger.warn({ scheduleId }, 'cron job deleted');
    }

    public async initSchedule(schedule: ScheduleModel, isDeleted: boolean = false,
        mode: ProcessMode = ProcessMode.SCHEDULED, type: ProcessType = ProcessType.INIT, overridedMethode?: () => void): Promise<ScheduleModel> {

        if (isDeleted) {
            const index = this.configurationService.schedules.findIndex(x => x._id === schedule._id);
            this.configurationService.schedules.splice(index, 1);
            await this.deleteCronJob(schedule._id);
            return schedule; 
        }

        this.configurationService.schedules.push(schedule);
        let methode = overridedMethode;
        if (!methode) {
            const process = this.preapreScheduleProcess(schedule, mode, type);
            methode = async (): Promise<void> => {
                setTimeout(async () => {
                    await this.clearAllSchedules();
                    // relire l'etat courant plutot que "process.schedule" (fige au moment de cet
                    // enregistrement) : setPaused() ne reconstruit jamais ce callback, il se
                    // contente de job.start()/job.stop() sur le CronJob deja enregistre - sans
                    // cette relecture, un depause posterieur (ex: demarrage du Group parent) reste
                    // invisible ici et le cycle ne demarre jamais malgre isPaused=false en base.
                    const liveSchedule = this._getLiveSchedule(schedule);
                    if (!liveSchedule.isPaused) {
                        await this.processService.execute({ ...process, schedule: liveSchedule });
                    }
                }, schedule.cron.sunBehavior ? 0 : schedule.cron.after);
            };
        }
        return this.createSchedule(schedule, methode);
    }

    // cf. commentaire dans initSchedule/restartAllSchedules : les callbacks de CronJob capturent
    // une reference figee au moment de l'enregistrement, jamais rafraichie par setPaused().
    private _getLiveSchedule(schedule: ScheduleModel): ScheduleModel {
        return this.configurationService.schedules.find(x => x._id === schedule._id) ?? schedule;
    }

    public preapreScheduleProcess(schedule: ScheduleModel, mode: ProcessMode = ProcessMode.SCHEDULED,
        type: ProcessType = ProcessType.FORCE, action: ExecutableAction = ExecutableAction.ON): ProcessModel {
        const process = new ProcessModel();
        process.cycle = this.configurationService.structure.cycles.find(x => x._id === schedule.cycleId);
        process.action = action;
        process.type = ProcessType.INIT;
        process.mode = mode;
        process.schedule = schedule;
        process.duration = schedule.duration;
        return process;
    }

    public async restartAllSchedules(): Promise<void> {
        const schedules = this.configurationService.schedules;
        const cycles = (await this.cycleRepository.get()) as CycleModel[];
        for (const key in schedules) {
            if (Object.hasOwnProperty.call(schedules, key)) {
                const schedule = schedules[key];
                const cycleModel = cycles.find(cycle => cycle._id === schedule.cycleId);
                const process = new ProcessModel();
                process.cycle = cycleModel;
                process.action = ExecutableAction.ON;
                process.type = ProcessType.INIT;
                process.mode = ProcessMode.SCHEDULED;
                process.duration = schedule.duration;
                process.schedule = schedule;
                const methode = async (): Promise<void> => {
                    setTimeout(async () => {
                        await this.clearAllSchedules();
                        // meme relecture a chaud que dans initSchedule (cf. commentaire la-bas).
                        const liveSchedule = this._getLiveSchedule(schedule);
                        if (!liveSchedule.isPaused) {
                            await this.processService.execute({ ...process, schedule: liveSchedule });
                        }
                    }, schedule.cron.after); 

                };
                this.createSchedule(schedule, methode);
            }
        }
    }

    public async clearAllSchedules(): Promise<void> {
        // supprimer les job qui on terminer et quin e s'executeront plus par ecxample execution ponctuel a une date donnée
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
