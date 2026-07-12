/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { TriggerModel } from '../models/trigger.model';
import { StructureService } from './configuration.service';
import { ProcessMode, ProcessType } from '../interfaces/executable.interface';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as math from 'mathjs';
import { StructureRepository } from '@process/infrastructure/repositories/structure.repository';
import { ScheduleModel } from '../models/schedule.model';
import { getSunrise, getSunset } from 'sunrise-sunset-js';
import { SunState } from '../interfaces/schedule.interface';
import { ScheduleService } from './schedule.service';
import { SensorModel } from '../models/sensor.model';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import { ProcessService } from './execution.service';
import { ConditionModel } from '../models/condition.model';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { EventRepository } from '@process/infrastructure/repositories/event.repository';
import { ElementType, ProcessEventData } from '../models/event.model';
import { ExecutableType } from '../models/value.model';
@Injectable()
export class TriggerService {
    public triggers: TriggerModel[] = [];
    public triggerCheckQueue = [];
    public checkTriggerQueueProcess = new BehaviorSubject<{ trigger: TriggerModel; data: SensorValueModel | ProcessValueModel }>(null);
    public onElementValueChanged = new BehaviorSubject<SensorValueModel | ProcessValueModel>(null);
    public constructor(
        private configurationService: StructureService,
        private scheduleService: ScheduleService,
        private structureRepository: StructureRepository,
        private triggerRepository: TriggerRepository,
        private scheduleRepository: ScheduleRepository,
        private sensorRepository: SensorRepository,
        private eventRepository: EventRepository,
        private valueRepository: ValueRepository,
        @Inject(forwardRef(() => ProcessService)) private processService: ProcessService,
        private readonly logger: Logger
    ) {
    }

    public initilize(): void {
        this.triggers = this.configurationService.triggers;
        this._processQueueCheckInProgress();
        this._listenValueChanged();
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
                const isSensor = Object.prototype.hasOwnProperty.call(element, 'value');
                if (isSensor) {
                    await this.eventRepository.save({
                        elementId: element.id,
                        date: new Date(),
                        elementType: ElementType.SENSOR,
                        additionalData: { value: (element as SensorValueModel).value?.toString() }
                    });
                } else {
                    const processElement = element as ProcessValueModel;
                    await this.eventRepository.save({
                        elementId: element.id,
                        date: new Date(),
                        elementType: processElement.type === ExecutableType.SEQUENCE ? ElementType.SEQUENCE : ElementType.CYCLE,
                        additionalData: { type: 'sensor', value: processElement.status?.toString() } as ProcessEventData
                    });
                }
                for (const trigger of triggers) {
                    this._checkTriggerConditions(trigger, element);
                }
            }
        })
    }
   
    private _enqueueCheckTrigger(trigger: TriggerModel, data: SensorValueModel | ProcessValueModel): boolean {
        if (!!trigger.isCheckInProgress) {
            if (!this.triggerCheckQueue.find(x => x.trigger.id === trigger.id)) {
                this.triggerCheckQueue.push({ trigger, data }); 
            }
        } 
        return !!trigger.isCheckInProgress;
    }

    private async _checkTriggerConditions(trigger: TriggerModel, data: SensorValueModel | ProcessValueModel): Promise<void> {
        const currentDate = new Date();
        const parser = math.parser();

        const isAllowCheckTrigger = !trigger.lastTriggeredAt || currentDate.getTime() >= (trigger.lastTriggeredAt.getTime() + trigger.delay || 0);

        if (!isAllowCheckTrigger || this._enqueueCheckTrigger(trigger, data) || trigger.isPaused) { return; }

        trigger.isCheckInProgress = true;

        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
        const asyncEvery = async (arr: ConditionModel[], predicate: { (condition: any): Promise<any>; (arg0: any): any; }) => {
            for (const e of arr) {
                if (!await predicate(e)) return false;
            }
            return true;
        };

        const isVerified = await asyncEvery(trigger.conditions, async (condition) => {
            const extractedVal = await this.valueRepository.getDeviceValue(condition.elementId);
            if (!extractedVal) { return false; }
            const value = condition.elementType === ElementType.SENSOR
                ? (extractedVal as SensorValueModel).value
                : (extractedVal as ProcessValueModel).status;
            if (value === undefined || value === null) { return false; }
            return parser.evaluate(`(${value} ${condition.operator} ${Number(condition.value)})`);
        });

        if (isVerified) {
            this.logger.log({ triggerId: trigger.id }, 'trigger conditions verified, planifying execution');
            const trg = await this.triggerRepository.save({ ...trigger, lastTriggeredAt: currentDate })
            this.triggers[this.triggers.findIndex(x=>x.id === trigger.id)] =  trg;
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
         this.structureRepository.get();
        return this.triggers.filter(x => !!x.conditions.find(y => y.elementId === element.id));
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

        const coord = { lat: 34.100780850096896, long: -6.4666017095313935 }
        const sunBehavior = trigger.trigger.sunBehavior;
        // eslint-disable-next-line max-len
        const executionDate = sunBehavior ? (sunBehavior.sunState === SunState.SUNRISE ? getSunset(coord.lat, coord.long, new Date()) : getSunrise(coord.lat, coord.long, new Date())).getTime() + sunBehavior.time : new Date().getTime() + trigger.trigger.timeAfter;

        const scheduleModel = new ScheduleModel();
        scheduleModel.cycleId = trigger.cycleId;
        // pas d'id manuel : ScheduleRepository.save() valide le format uuid quand un id est
        // fourni, laisser le schema Mongoose en generer un (comme pour toute autre creation).
        scheduleModel.name = `trigger_${trigger.id}`;
        scheduleModel.cron = { date: new Date(executionDate) };
        scheduleModel.shouldConfirmation = trigger.shouldConfirmation;
        scheduleModel.duration = trigger.duration;
        const scheduleSaved = await this.scheduleRepository.save(scheduleModel);

        const process = this.scheduleService.preapreScheduleProcess(scheduleSaved, ProcessMode.TRIGGER, ProcessType.FORCE, trigger.action);
        const methode = async (): Promise<void> => {
            await this.scheduleService.clearAllSchedules();
            await this.processService.execute({ ...process });
            trigger.isCheckInProgress = false;
            this.checkTriggerQueueProcess.next({ trigger, data })
        };

        this.scheduleService.initSchedule(scheduleSaved, false, ProcessMode.TRIGGER, ProcessType.FORCE, methode);
    }
}
