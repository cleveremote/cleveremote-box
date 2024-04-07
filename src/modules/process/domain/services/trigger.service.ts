/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable } from '@nestjs/common';
import { TriggerModel } from '../models/trigger.model';
import { ConfigurationService } from './configuration.service';
import { ProcessService } from './execution.service';
import { ExecutableAction, ProcessMode, ProcessType } from '../interfaces/executable.interface';
import { Subscription } from 'rxjs';
import * as math from 'mathjs'
import { ProcessModel } from '../models/process.model';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { ScheduleModel } from '../models/schedule.model';
import { getSunrise, getSunset } from 'sunrise-sunset-js';
import { SunState } from '../interfaces/schedule.interface';
import { ScheduleService } from './schedule.service';
import { SensorModel } from '../models/sensor.model';
import { IExecutableState, ISensorValue } from '../interfaces/structure-repository.interface';

@Injectable()
export class TriggerService {
    public triggers: TriggerModel[] = [];
    public triggerSubscriptions: { id: string; device: SensorModel; sub: Subscription }[] = [];
    public constructor(
        private configurationService: ConfigurationService,
        private scheduleService: ScheduleService,
        private structureRepository: ConfigurationRepository) {
    }

    public initilize(): void {
        if (this.configurationService.triggers?.length > 0) {
            this.configurationService.triggers.forEach(trigger => {
                this.initTrigger(trigger.id);
            });
        }
    }

    public async checkTriggerConditions(trigger: TriggerModel, data: ISensorValue | IExecutableState): Promise<void> {
        const values = await this.structureRepository.setValues(data);
        if (!values) {
            return;
        }
        let fullFunction;
        const res = trigger.conditions.every((condition, index) => {
            const isLast = trigger.conditions.length - 1 === index;
            const deviceValue = values?.find(x => x.id === condition.deviceId);
            if (!deviceValue) {
                return false;
            }
            const conditionfn = `(${deviceValue.value} ${condition.operator} ${condition.value})`;
            if (!isLast && trigger.conditions.length > 1) {
                fullFunction = (fullFunction || '') + conditionfn + 'and';
            } else {
                fullFunction = (fullFunction || '') + conditionfn;
            }
            return true;
        });
        if (!res) {
            return;
        }
        const currentDate = new Date();
        const isAllowCheckTrigger = trigger.lastTriggeredAt ?
            currentDate.getTime() >= (trigger.lastTriggeredAt.getTime() + trigger.delay || 0) : true;
        const parser = math.parser();
        const isVerified = parser.evaluate(fullFunction) && isAllowCheckTrigger;
        if (isVerified) {
            trigger.lastTriggeredAt = currentDate;
            await this.structureRepository.saveStructure(this.configurationService.structure);
            this.planifyExecution(trigger);
        }
        return;
    }

    public initTrigger(id: string): void {
        const trigger = this.configurationService.triggers.find(x => x.id === id);

        this.reinitilizeTriggerListeners(id);
        trigger.conditions.forEach(condition => {
            const device = this.configurationService.getDevice(condition.deviceId);
            const st = this.configurationService.deviceListeners.find(x => x.deviceId === device.id);
            if (st) {
                const sub = st.subject.subscribe(value => {
                    if (value) {
                        this.checkTriggerConditions(trigger, value)
                    }
                });
                this.triggerSubscriptions.push({ id, device, sub });
            }

        });
    }

    public reinitilizeTriggerListeners(id: string): void {
        const indexTriggerListner = this.triggerSubscriptions.findIndex(x => x.id === id);
        if (indexTriggerListner !== -1) {
            indexTriggerListner[indexTriggerListner].sub.unsubscribe();
            this.triggerSubscriptions.splice(indexTriggerListner, 1);
        }
    }

    public planifyExecution(triggerModel: TriggerModel): void {

        const coord = { lat: 34.100780850096896, long: -6.4666017095313935 }
        const sunBehavior = triggerModel.trigger.sunBehavior;
        // eslint-disable-next-line max-len
        const executionDate = sunBehavior ? (sunBehavior.sunState === SunState.SUNRISE ? getSunset(coord.lat, coord.long, new Date()) : getSunrise(coord.lat, coord.long, new Date())).getTime() + (sunBehavior.isBefore ? -1 : 1) * sunBehavior.time : new Date().getTime() + triggerModel.trigger.timeAfter;

        const scheduleModel = new ScheduleModel();
        scheduleModel.cycleId = triggerModel.cycleId;
        scheduleModel.id = 'trigger_' + triggerModel.id;
        scheduleModel.cron = { date: new Date(executionDate) };
        const cycle = this.configurationService.structure.cycles.find(x => x.id === triggerModel.cycleId);
        cycle.schedules.push(scheduleModel);
        this.structureRepository.saveStructure(this.configurationService.structure);
        this.scheduleService.initSchedule(scheduleModel, ProcessMode.TRIGGER, ProcessType.FORCE);
    }
}
