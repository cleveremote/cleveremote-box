/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
/* eslint-disable max-lines */
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
import { SunBehavior } from '@process/infrastructure/dto/synchronize.dto';
import { ComputeSunEventDate, ResolveCoordinates } from './sun-event.util';
import { GlobalSettingsService } from './global-settings.service';

@Injectable()
export class ScheduleService {

    public constructor(
        private schedulerRegistry: SchedulerRegistry,
        private configurationService: StructureService,
        @Inject(forwardRef(() => ProcessService)) private processService: ProcessService,
        private cycleRepository: CycleRepository,
        private scheduleRepository: ScheduleRepository,
        private globalSettingsService: GlobalSettingsService,
        private readonly logger: Logger
    ) {
    }

    public createSchedule(schedule: ScheduleModel, methode: () => void): ScheduleModel {
        if (this.schedulerRegistry.doesExist('cron', schedule._id)) {
            const job = this.schedulerRegistry.getCronJob(schedule._id);
            job.stop();
            this.schedulerRegistry.deleteCronJob(schedule._id);
        }
        // un job "instant" (cf. _armSunInstant) peut rester arme d'une precedente version du
        // schedule (ex: sunBehavior retire lors d'une edition) : on le purge systematiquement,
        // la branche sunBehavior ci-dessous le rearmera si necessaire.
        this._deleteInstantJob(schedule._id);

        try {
            const sunBehavior = schedule.cron.sunBehavior;
            if (sunBehavior) {
                this._createSunDrivenSchedule(schedule, sunBehavior, methode);
            } else {
                const now = new Date();
                const job = new CronJob(schedule.cron.pattern || schedule.cron.date || new Date(now.getTime() + 10000), methode);
                this.schedulerRegistry.addCronJob(schedule._id, job);
                if (schedule.isPaused) {
                    job.stop();
                } else {
                    job.start();
                }
            }
        } catch (e) {
            this.logger.error({ error: e }, 'createSchedule failed');
        }

        return schedule;

    }

    // enregistre le "driver" (cron ne portant que jour/mois/semaine, heure normalisee a minuit)
    // qui recalcule chaque jour concerne l'heure exacte du lever/coucher du soleil et arme un
    // schedule ponctuel (one-shot) a cette heure precise. Le driver reste enregistre sous
    // schedule._id (remplace/pause comme n'importe quel autre job) ; l'execution reelle passe
    // toujours par un CronJob one-shot distinct, cf. _armSunInstant.
    private _createSunDrivenSchedule(schedule: ScheduleModel, sunBehavior: SunBehavior, methode: () => void): void {
        const driverPattern = this._normalizeSunDriverPattern(schedule.cron.pattern);
        const driverJob = new CronJob(driverPattern, () => this._armSunInstant(schedule, sunBehavior, methode));
        this.schedulerRegistry.addCronJob(schedule._id, driverJob);
        if (schedule.isPaused) {
            driverJob.stop();
        } else {
            driverJob.start();
            // rattrapage immediat : sans cet appel, un schedule (re)cree apres l'heure a laquelle
            // le driver tique normalement (ou apres un redemarrage en cours de journee) devrait
            // attendre le prochain jour valide avant sa premiere execution.
            this._armSunInstant(schedule, sunBehavior, methode);
        }
    }

    // ne garde que les champs jour-du-mois/mois/jour-de-semaine du pattern fourni : l'heure exacte
    // d'execution est entierement pilotee par le calcul solaire, pas par le pattern.
    private _normalizeSunDriverPattern(pattern?: string): string {
        if (!pattern) { return '0 0 * * *'; }
        const [dayOfMonth = '*', month = '*', dayOfWeek = '*'] = pattern.trim().split(/\s+/).slice(-3);
        return `0 0 ${dayOfMonth} ${month} ${dayOfWeek}`;
    }

    // calcule l'heure exacte du jour courant (lever/coucher + timeDirection + offset) et y arme un
    // CronJob one-shot distinct du driver. Si l'heure est deja passee pour aujourd'hui, on ne
    // rattrape pas : le prochain tick valide du driver reessaiera pour le jour suivant.
    private _armSunInstant(schedule: ScheduleModel, sunBehavior: SunBehavior, methode: () => void): void {
        const coordinates = ResolveCoordinates(this.globalSettingsService.localCoordinates);
        const executionDate = ComputeSunEventDate(sunBehavior, new Date(), coordinates);
        if (executionDate.getTime() <= Date.now()) {
            this.logger.warn({ scheduleId: schedule._id, executionDate }, 'sun event already passed for today, waiting for next occurrence');
            return;
        }
        this._deleteInstantJob(schedule._id);
        const instantJob = new CronJob(executionDate, methode);
        this.schedulerRegistry.addCronJob(this._instantJobId(schedule._id), instantJob);
        instantJob.start();
    }

    private _instantJobId(scheduleId: string): string {
        return `${scheduleId}::instant`;
    }

    private _deleteInstantJob(scheduleId: string): void {
        const instantId = this._instantJobId(scheduleId);
        if (this.schedulerRegistry.doesExist('cron', instantId)) {
            const job = this.schedulerRegistry.getCronJob(instantId);
            job.stop();
            this.schedulerRegistry.deleteCronJob(instantId);
        }
    }

    public async setPaused(schedule: ScheduleModel, isPaused: boolean): Promise<ScheduleModel> {
        const isStateUnchanged = schedule.isPaused === isPaused;
        // auto-guerison : si le schedule est cense tourner (isPaused=false) mais que son job a
        // disparu du SchedulerRegistry (purge inattendue dans clearAllSchedules, etc.), un simple
        // "relancer" depuis l'UI qui renvoie la meme valeur d'isPaused etait jusqu'ici un no-op
        // total - rien ne le reenregistrait avant un redemarrage complet du process.
        if (isStateUnchanged && !this._isMissingWhileActive(schedule, isPaused)) { return schedule; }

        const saved = isStateUnchanged ? schedule : await this.scheduleRepository.save({ ...schedule, isPaused });
        if (!isStateUnchanged) {
            const index = this.configurationService.schedules.findIndex(x => x._id === schedule._id);
            if (index !== -1) { this.configurationService.schedules[index] = saved; }
        }
        if (this.schedulerRegistry.doesExist('cron', schedule._id)) {
            this._applyPausedState(saved, isPaused);
        } else if (!isPaused) {
            await this.initSchedule(saved, false, ProcessMode.SCHEDULED, ProcessType.INIT);
        }
        return saved;
    }

    private _isMissingWhileActive(schedule: ScheduleModel, isPaused: boolean): boolean {
        const isMissing = !isPaused && !this.schedulerRegistry.doesExist('cron', schedule._id);
        if (isMissing) {
            this.logger.warn({ scheduleId: schedule._id }, 'schedule active in database but missing from the scheduler registry, re-arming it');
        }
        return isMissing;
    }

    private _applyPausedState(saved: ScheduleModel, isPaused: boolean): void {
        const job = this.schedulerRegistry.getCronJob(saved._id);
        if (isPaused) {
            job.stop();
            return;
        }
        job.start();
        if (saved.cron.sunBehavior) {
            const process = this.preapreScheduleProcess(saved, ProcessMode.SCHEDULED, ProcessType.INIT);
            this._armSunInstant(saved, saved.cron.sunBehavior, this._buildExecutionMethode(saved, process));
        }
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
        this._deleteInstantJob(scheduleId);
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

        // idempotent : setPaused() peut rappeler initSchedule() pour re-armer un schedule deja
        // tracke dont le job a disparu du registre (cf. commentaire dans setPaused) - un push
        // inconditionnel dupliquerait l'entree dans configurationService.schedules.
        if (!this.configurationService.schedules.some(x => x._id === schedule._id)) {
            this.configurationService.schedules.push(schedule);
        }
        const process = this.preapreScheduleProcess(schedule, mode, type);
        const methode = overridedMethode ?? this._buildExecutionMethode(schedule, process);
        return this.createSchedule(schedule, methode);
    }

    // construit le callback final d'execution, partage entre initSchedule et restartAllSchedules :
    // relit l'etat courant du schedule (cf. commentaire de _getLiveSchedule) et n'execute le
    // process que si le schedule n'est pas en pause au moment ou le job (driver, pattern ou
    // instant solaire) se declenche reellement.
    private _buildExecutionMethode(schedule: ScheduleModel, process: ProcessModel): () => void {
        return (): void => {
            setTimeout(async () => {
                await this.clearAllSchedules();
                const liveSchedule = this._getLiveSchedule(schedule);
                if (!liveSchedule.isPaused) {
                    await this.processService.execute({ ...process, schedule: liveSchedule });
                }
            }, 0);
        };
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
                this.createSchedule(schedule, this._buildExecutionMethode(schedule, process));
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
                // nextDate() ne doit throw que pour un one-shot deja passe (cf. lib "cron") ; si un
                // job recurrent finit ici pour une autre raison, c'etait jusqu'ici totalement
                // silencieux (job + schedule persiste supprimes sans aucune trace de la cause reelle).
                this.logger.error({ error: e, scheduleId: key }, 'clearAllSchedules: unexpected error computing nextDate, deleting job');
                await this.deleteCronJob(key);
            }
        }
    }


}
