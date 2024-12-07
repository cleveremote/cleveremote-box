/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable } from '@nestjs/common';
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
import { SensorEntity } from '@process/infrastructure/entities/sensor.entity';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import { ProcessValueRepository } from '@process/infrastructure/repositories/process-value.repository';
import { SensorValueRepository } from '@process/infrastructure/repositories/sensor-value.repository';
import { ProcessService } from './execution.service';
import { ConditionModel } from '../models/condition.model';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { DataRepository } from '@process/infrastructure/repositories/data.repository';
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
        private processValueRepository: ProcessValueRepository,
        private sensorValueRepository: SensorValueRepository,
        private dataRepository: DataRepository,
        private valueRepository: ValueRepository,
        private processService: ProcessService

    ) {
    }

    public initilize(): void {
        this.triggers = this.configurationService.triggers;
        this._processQueueCheckInProgress();
        this._listenValueChanged();
    }

    public async initTrigger(trigger: TriggerModel, isDeleted: boolean = false): Promise<TriggerModel> {
        const index = this.triggers.findIndex(x => x.id === trigger.id);
        if (isDeleted && index !== -1) {
            this.triggers.splice(index, 1);
        } else if (index !== -1) {
            this.triggers[0] = trigger;
        } else {
            this.triggers.push(trigger);
        }
        return trigger;
    }

    private _listenValueChanged(): void {
        this.onElementValueChanged.subscribe(async (element: SensorValueModel | ProcessValueModel) => {
            if (element) {
                const triggers = this._getTriggerByElementId(element);
                await this.dataRepository.save({ id: Math.random().toString(), deviceId: element.id, date: new Date(), type: "SENSOR",value:(element as SensorValueModel ).value.toString() })
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
        return trigger.isCheckInProgress;
    }

    private async _saveIncommingValue(data: SensorValueModel | ProcessValueModel): Promise<void> {
        const isSensor = Object.prototype.hasOwnProperty.call(data, 'value');
        if (isSensor) {
            await this.sensorValueRepository.save(data as SensorValueModel);
            return;
        }
        await this.processValueRepository.save(data as ProcessValueModel);
    }

    private async _checkTriggerConditions(trigger: TriggerModel, data: SensorValueModel | ProcessValueModel): Promise<void> {
        const currentDate = new Date();
        const parser = math.parser();

        await this._saveIncommingValue(data);

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
            const extractedVal = await this.valueRepository.getDeviceValue(condition.deviceId);
            const value = (extractedVal as SensorValueModel).value || (extractedVal as ProcessValueModel).status;
            if (!value) { return false; }
            return parser.evaluate(`(${value} ${condition.operator} ${condition.value})`);
        });

        if (isVerified) {
            await this.triggerRepository.save({ ...trigger, lastTriggeredAt: currentDate });
            this._planifyExecution(trigger, data);
            return;
        }

        trigger.isCheckInProgress = false;
        this.checkTriggerQueueProcess.next({ trigger, data });
    }

    private _getTriggerByElementId(element: SensorValueModel | ProcessValueModel): TriggerModel[] {
        return this.triggers.filter(x => !!x.conditions.find(y => y.deviceId === element.id));
    }

    private _processQueueCheckInProgress(): void {
        this.checkTriggerQueueProcess.subscribe((value) => {
            const index = this.triggerCheckQueue.findIndex(x => x.trigger.id === value.trigger.id);
            this.triggerCheckQueue.splice(index, 1)
            if (value?.trigger && value?.data) {
                this._checkTriggerConditions(value.trigger, value.data);
            }
        })
    }

    private async _planifyExecution(trigger: TriggerModel, data: SensorValueModel | ProcessValueModel): Promise<void> {

        const coord = { lat: 34.100780850096896, long: -6.4666017095313935 }
        const sunBehavior = trigger.trigger.sunBehavior;
        // eslint-disable-next-line max-len
        const executionDate = sunBehavior ? (sunBehavior.sunState === SunState.SUNRISE ? getSunset(coord.lat, coord.long, new Date()) : getSunrise(coord.lat, coord.long, new Date())).getTime() + sunBehavior.time : new Date().getTime() + trigger.trigger.timeAfter;

        const scheduleModel = new ScheduleModel();
        scheduleModel.cycleId = trigger.cycleId;
        scheduleModel.id = 'trigger_' + math.random();
        scheduleModel.cron = { date: new Date(executionDate) };
        scheduleModel.shouldConfirmation = trigger.shouldConfirmation;
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
