/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { CycleModel } from '../models/cycle.model';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { TriggerModel } from '../models/trigger.model';
import { StructureService } from './configuration.service';
import { ProcessMode } from '../interfaces/executable.interface';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ScheduleModel } from '../models/schedule.model';
import { ComputeSunEventDate, ResolveCoordinates } from './sun-event.util';
import { ScheduleService } from './schedule.service';
import { GlobalSettingsService } from './global-settings.service';
import { SensorModel } from '../models/sensor.model';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import { ProcessService } from './execution.service';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { EventRepository } from '@process/infrastructure/repositories/event.repository';
import { ElementType, EventSource } from '../models/event.model';
import { evaluateConditions } from '../utils/evaluate-conditions.util';
import { SunBehavior } from '@process/infrastructure/dto/synchronize.dto';
@Injectable()
export class TriggerService {
    // toujours lire la liste courante de ConfigurationService : getStructure() (ex: synchronizeCycle)
    // la remplace par un nouveau tableau ; une copie locale gardait des triggers perimes
    // (ex: ancien shouldConfirmation=true) qui etaient ensuite re-sauvegardes en base au declenchement.
    public get triggers(): TriggerModel[] {
        return this.configurationService.triggers ?? [];
    }
    public triggerCheckQueue = [];
    public checkTriggerQueueProcess = new BehaviorSubject<{ trigger: TriggerModel; data: SensorValueModel | ProcessValueModel }>(null);
    public onElementValueChanged = new BehaviorSubject<SensorValueModel | ProcessValueModel>(null);
    // executions solaires planifiees et pas encore declenchees (cle : schedule._id) : leur date est
    // recalculee quand localCoordinates ou timeZone changent (cf. _replanSunSchedules)
    private _pendingSunSchedules = new Map<string, { schedule: ScheduleModel; sunBehavior: SunBehavior; methode: () => Promise<void> }>();
    public constructor(
        private configurationService: StructureService,
        private scheduleService: ScheduleService,
        private triggerRepository: TriggerRepository,
        private scheduleRepository: ScheduleRepository,
        private sensorRepository: SensorRepository,
        private eventRepository: EventRepository,
        private valueRepository: ValueRepository,
        @Inject(forwardRef(() => ProcessService)) private processService: ProcessService,
        private globalSettingsService: GlobalSettingsService,
        private readonly logger: Logger
    ) {
    }

    public initilize(): void {
        this._processQueueCheckInProgress();
        this._listenValueChanged();
        this.globalSettingsService.onLocationChanged.subscribe(() => {
            this._replanSunSchedules().catch((error) => this.logger.error({ error }, 'failed to replan sun triggers'));
        });
    }

    public async initTrigger(trigger: TriggerModel, isDeleted: boolean = false): Promise<TriggerModel> {
        this.logger.log({ triggerId: trigger.id, isDeleted }, 'initTrigger');
        const index = this.triggers.findIndex(x => x.id === trigger.id);
        if (isDeleted) {
            if (index !== -1) {
                this.triggers.splice(index, 1);
            }
        } else if (index !== -1) {
            this.triggers[index] = trigger;
        } else {
            this.triggers.push(trigger);
        }
        return trigger;
    }

    private _listenValueChanged(): void {
        this.onElementValueChanged.subscribe(async (element: SensorValueModel | ProcessValueModel) => {
            if (element) {
                const triggers = this._getTriggerByElementId(element);
                // les ProcessValueModel n'ont pas de champ `.value` (seulement `.status`) :
                // deviner le type via la meme detection que _saveIncommingValue() plutot que de
                // supposer un SensorValueModel partout, ce qui plantait sur toute valeur process.
                // une valeur process (statut de cycle) est deja journalisee par ProcessService._processProgress :
                // seule une valeur capteur est enregistree ici.
                const isSensor = Object.prototype.hasOwnProperty.call(element, 'value');
                if (isSensor) {
                    await this.eventRepository.save({
                        elementId: element.id,
                        date: new Date(),
                        elementType: ElementType.SENSOR,
                        additionalData: { value: (element as SensorValueModel).value?.toString() }
                    });
                }
                for (const trigger of triggers) {
                    this._checkTriggerConditions(trigger, element);
                }
            }
        })
    }

    private _enqueueCheckTrigger(trigger: TriggerModel, data: SensorValueModel | ProcessValueModel): boolean {
        if (trigger.isCheckInProgress) {
            if (!this.triggerCheckQueue.find(x => x.trigger.id === trigger.id)) {
                this.triggerCheckQueue.push({ trigger, data });
            }
        }
        return !!trigger.isCheckInProgress;
    }

    private async _checkTriggerConditions(trigger: TriggerModel, data: SensorValueModel | ProcessValueModel): Promise<void> {
        const currentDate = new Date();

        const isAllowCheckTrigger = !trigger.lastTriggeredAt || currentDate.getTime() >= (trigger.lastTriggeredAt.getTime() + trigger.delay || 0);

        if (!isAllowCheckTrigger || this._enqueueCheckTrigger(trigger, data) || trigger.isPaused) { return; }

        trigger.isCheckInProgress = true;

        const getDeviceValue = (elementId: string) => this.valueRepository.getDeviceValue(elementId);
        const isTriggerVerified = await evaluateConditions(trigger.conditions, getDeviceValue,
            (detail) => this.logger.debug({ triggerId: trigger.id, ...detail }, 'trigger conditions not verified'));
        // conditions du cycle evaluees ici aussi : si elles sont fausses on ne consomme pas le
        // declenchement (lastTriggeredAt/delay), le trigger sera reevalue quand elles changeront
        // (cf. _getTriggerByElementId qui ecoute aussi les elements des conditions du cycle).
        const isVerified = isTriggerVerified && await evaluateConditions(this._getTriggerCycle(trigger)?.conditions, getDeviceValue,
            (detail) => this.logger.debug({ triggerId: trigger.id, cycleId: trigger.cycleId, ...detail }, 'trigger: cycle conditions not verified, waiting'));

        if (isVerified) {
            this.logger.log({ triggerId: trigger.id }, 'trigger conditions verified, planifying execution');
            // repartir de la version courante (une synchro a pu la modifier pendant l'evaluation)
            const current = this.triggers.find(x => x.id === trigger.id) ?? trigger;
            const trg = await this.triggerRepository.save({ ...current, lastTriggeredAt: currentDate })
            this.triggers[this.triggers.findIndex(x => x.id === trigger.id)] = trg;
            await this._planifyExecution(trg, data);
            return;
        }

        trigger.isCheckInProgress = false;
        // ne republier que s'il y a effectivement une verification en attente pour ce trigger
        // (mise en file par _enqueueCheckTrigger pendant qu'un check etait deja en cours) :
        // republier inconditionnellement ici reprovoquait indefiniment le meme check en boucle
        // synchrone des que la condition restait non verifiee.
        if (this.triggerCheckQueue.find(x => x.trigger.id === trigger.id)) {
            this.checkTriggerQueueProcess.next({ trigger, data });
        }
    }

    public async setPaused(trigger: TriggerModel, isPaused: boolean): Promise<TriggerModel> {
        if (trigger.isPaused === isPaused) { return trigger; }
        const saved = await this.triggerRepository.save({ ...trigger, isPaused });
        const index = this.triggers.findIndex(x => x.id === trigger.id);
        if (index !== -1) { this.triggers[index] = saved; }
        return saved;
    }

    private _getTriggerByElementId(element: SensorValueModel | ProcessValueModel): TriggerModel[] {
        return this.triggers.filter(x => !!x.conditions?.find(y => y.elementId === element.id) ||
            !!this._getTriggerCycle(x)?.conditions?.find(y => y.elementId === element.id));
    }

    private _getTriggerCycle(trigger: TriggerModel): CycleModel | undefined {
        return this.configurationService.structure?.cycles?.find(x => x._id === trigger.cycleId);
    }

    private _processQueueCheckInProgress(): void {
        this.checkTriggerQueueProcess.subscribe((value) => {
            if (!value?.trigger) { return; }
            const index = this.triggerCheckQueue.findIndex(x => x.trigger.id === value.trigger.id);
            if (index === -1) { return; }
            const queued = this.triggerCheckQueue[index];
            this.triggerCheckQueue.splice(index, 1);
            this._checkTriggerConditions(queued.trigger, queued.data);
        })
    }

    private async _planifyExecution(trigger: TriggerModel, data: SensorValueModel | ProcessValueModel): Promise<void> {

        const sunBehavior = trigger.trigger.sunBehavior;
        const executionDate = sunBehavior
            ? this._computeSunDate(sunBehavior).getTime()
            : new Date().getTime() + trigger.trigger.timeAfter;

        const scheduleModel = new ScheduleModel();
        scheduleModel.cycleId = trigger.cycleId;
        // pas d'id manuel : ScheduleRepository.save() valide le format uuid quand un id est
        // fourni, laisser le schema Mongoose en generer un (comme pour toute autre creation).
        scheduleModel.name = `trigger_${trigger.id}`;
        scheduleModel.cron = { date: new Date(executionDate) };
        scheduleModel.shouldConfirmation = trigger.shouldConfirmation;
        scheduleModel.duration = trigger.duration;
        const scheduleSaved = await this.scheduleRepository.save(scheduleModel);

        const process = this.scheduleService.preapreScheduleProcess(scheduleSaved, ProcessMode.TRIGGER, trigger.action,
            { source: EventSource.TRIGGER, refId: trigger.id, refName: trigger.name });
        const methode = async (): Promise<void> => {
            this._pendingSunSchedules.delete(scheduleSaved._id);
            await this.scheduleService.clearAllSchedules();
            await this.processService.execute({ ...process });
            trigger.isCheckInProgress = false;
            this.checkTriggerQueueProcess.next({ trigger, data })
        };

        if (sunBehavior) {
            this._pendingSunSchedules.set(scheduleSaved._id, { schedule: scheduleSaved, sunBehavior, methode });
        }
        this.scheduleService.initSchedule(scheduleSaved, false, ProcessMode.TRIGGER, methode);
    }

    private _computeSunDate(sunBehavior: SunBehavior): Date {
        return ComputeSunEventDate(sunBehavior, new Date(), ResolveCoordinates(this.globalSettingsService.localCoordinates),
            this.globalSettingsService.timeZone);
    }

    // recalcule l'heure des executions solaires en attente avec la nouvelle position / le nouveau fuseau ;
    // si la nouvelle heure est deja passee, on garde le job existant plutot que de perdre l'execution
    private async _replanSunSchedules(): Promise<void> {
        for (const [scheduleId, pending] of this._pendingSunSchedules) {
            // schedule supprime entre-temps (synchro) : rien a replanifier
            if (!this.configurationService.schedules.some(x => x._id === scheduleId)) {
                this._pendingSunSchedules.delete(scheduleId);
                continue;
            }
            const executionDate = this._computeSunDate(pending.sunBehavior);
            if (executionDate.getTime() <= Date.now()) {
                this.logger.warn({ scheduleId, executionDate }, 'replanned sun trigger already passed, keeping previous date');
                continue;
            }
            const schedule = await this.scheduleRepository.save({ ...pending.schedule, cron: { ...pending.schedule.cron, date: executionDate } });
            pending.schedule = schedule;
            // index relu apres l'await : la liste a pu bouger pendant la sauvegarde
            const index = this.configurationService.schedules.findIndex(x => x._id === scheduleId);
            if (index !== -1) { this.configurationService.schedules[index] = schedule; }
            this.scheduleService.createSchedule(schedule, pending.methode);
        }
    }
}
