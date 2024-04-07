/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { ExecutableStatus } from '../interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '../interfaces/structure.interface';
import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { ScheduleModel } from '../models/schedule.model';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';
import {
    SynchronizeCycleModel,
    SynchronizeModuleModel,
    SynchronizeScheduleModel,
    SynchronizeSensorModel,
    SynchronizeSequenceModel, SynchronizeTriggerModel
} from '../models/synchronize.model';
import { ConfigurationService } from './configuration.service';
import { ScheduleService } from './schedule.service';
import * as admin from 'firebase-admin';
import { TriggerModel } from '../models/trigger.model';
import { TriggerService } from './trigger.service';
import { strict } from 'assert';
import { SensorModel } from '../models/sensor.model';

@Injectable()
export class SynchronizeService {
    public constructor(private structureRepository: ConfigurationRepository,
        private configurationService: ConfigurationService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService
    ) { }

    public async synchronize(configuration: StructureModel): Promise<StructureModel> {
        console.log('configuration', configuration);
        const message = {
            notification: {
                title: 'test title',
                body: 'this is test body'
            },
            token: 'c7yPELY5Rra0sHw6Fpq1Kn:APA91bFLtT1CSjQrt-boVHapdlZapc585f0Sll0fwNQAew7s1Sa8SNadYTkqvYjfpCkkgtgkerytnCmnzdQ9zdVJjQIcd8awiL6wDZykoXDNfkqrafEGT2kEUOH001u1TvZ-B-oRLZpM'
        };

        admin.messaging().send(message).then((response) => {
            console.log('message envoyé ');
        }).catch((error) => {
            console.log('message envoyé ', error);
        })
        return this.structureRepository.saveStructure(configuration).then((data) => {
            this.configurationService.structure = data;

            const cycles = this.configurationService.structure.cycles;

            let sequences: SequenceModel[] = [];
            cycles.forEach((cycle) => {
                sequences = sequences.concat(cycle.sequences);
                sequences = [...new Set([...sequences, ...cycle.sequences])];
            });
            this.configurationService.sequences = sequences;

            return data;
        });
    }

    public async sychronizePartial(cycleData: SynchronizeCycleModel): Promise<CycleModel> {
        this._syncCycle(this.configurationService.structure, cycleData);
        await this.synchronize(this.configurationService.structure);
        return this.configurationService.structure.cycles.find(x => x.id === cycleData.id) || cycleData;
    }

    public async sychronizeSchedule(scheduleData: SynchronizeScheduleModel): Promise<CycleModel> {
        this._syncSchedule(this.configurationService.structure, scheduleData);
        await this.synchronize(this.configurationService.structure);
        return this.configurationService.structure.cycles.find(x => x.id === scheduleData.cycleId);
    }

    public async sychronizeTrigger(triggerData: SynchronizeTriggerModel): Promise<CycleModel> {
        this._syncTrigger(this.configurationService.structure, triggerData);
        await this.synchronize(this.configurationService.structure);
        return this.configurationService.structure.cycles.find(x => x.id === triggerData.cycleId);
    }

    public async sychronizeSensor(sensorData: SynchronizeSensorModel): Promise<SensorModel> {
        this._syncSensor(this.configurationService.structure, sensorData);
        await this.synchronize(this.configurationService.structure);
        return this.configurationService.structure.sensors.find(x => x.id === sensorData.id);
    }

    private _syncSchedule(structure: StructureModel, data: SynchronizeScheduleModel): Promise<void> {
        const parentCycle = structure.cycles.find((cycle) => cycle.id === data.cycleId);
        console.log('parentCycle', parentCycle);
        const scheduleToUpdate = parentCycle.schedules.find((sch) => sch.id === data.id);
        if (scheduleToUpdate && data.shouldDelete) {
            const index = parentCycle.schedules.findIndex(cy => cy.id === data.id);
            this.scheduleService.deleteCronJob(data.id);
            parentCycle.schedules.splice(index, 1);
        } else if (scheduleToUpdate) {
            scheduleToUpdate.cycleId = data.cycleId;
            scheduleToUpdate.name = data.name;
            scheduleToUpdate.description = data.description;
            scheduleToUpdate.cron = data.cron;
            scheduleToUpdate.isPaused = data.isPaused;
            this.scheduleService.deleteCronJob(data.id);
            return this._initializeSchedule(scheduleToUpdate);
        } else {
            const scheduleModel = new ScheduleModel();
            scheduleModel.cycleId = data.cycleId;
            scheduleModel.id = data.id;
            scheduleModel.name = data.name;
            scheduleModel.description = data.description;
            scheduleModel.cron = data.cron;
            scheduleModel.isPaused = data.isPaused;
            parentCycle.schedules.push(scheduleModel);
            return this._initializeSchedule(scheduleModel);
        }
    }



    private _syncSensor(structure: StructureModel, data: SynchronizeSensorModel): void {
        const sensorToUpdate = structure.sensors.find((sensor) => sensor.id === data.id);
        if (sensorToUpdate && data.shouldDelete) {
            const index = structure.sensors.findIndex(cy => cy.id === data.id);
            structure.sensors.splice(index, 1);
        } else if (sensorToUpdate) {
            sensorToUpdate.name = data.name;
            sensorToUpdate.description = data.description;
            sensorToUpdate.unit = data.unit;
            sensorToUpdate.type = data.type;
        } else {
            const sensorModel = new SensorModel();
            sensorModel.name = data.name;
            sensorModel.description = data.description;
            sensorModel.unit = data.unit;
            sensorModel.type = data.type;
            structure.sensors.push(sensorModel);
        }
    }

    private _syncTrigger(structure: StructureModel, data: SynchronizeTriggerModel): Promise<void> {
        const parentCycle = structure.cycles.find((cycle) => cycle.id === data.cycleId);
        console.log('parentCycle', parentCycle);
        const triggerToUpdate = parentCycle.triggers.find((sch) => sch.id === data.id);
        if (triggerToUpdate && data.shouldDelete) {
            const index = parentCycle.triggers.findIndex(cy => cy.id === data.id);
            //this.triggerService.deleteCronJob(data.id);
            parentCycle.triggers.splice(index, 1);
        } else if (triggerToUpdate) {
            triggerToUpdate.cycleId = data.cycleId;
            triggerToUpdate.name = data.name;
            triggerToUpdate.description = data.description;
            triggerToUpdate.trigger = data.trigger;
            triggerToUpdate.isPaused = data.isPaused;
            triggerToUpdate.delay = data.delay;
            triggerToUpdate.conditions = data.conditions;
            triggerToUpdate.action = data.action;
            return this._initializeTrigger(triggerToUpdate);
        } else {
            const triggerModel = new TriggerModel();
            triggerModel.cycleId = data.cycleId;
            triggerModel.id = data.id;
            triggerModel.name = data.name;
            triggerModel.description = data.description;
            triggerModel.trigger = data.trigger;
            triggerModel.isPaused = data.isPaused;
            triggerModel.delay = data.delay;
            triggerModel.conditions = data.conditions;
            triggerModel.action = data.action;
            parentCycle.triggers.push(triggerModel);
            return this._initializeTrigger(triggerModel);
        }
    }

    private async _initializeSchedule(schedule: ScheduleModel): Promise<void> {
        await this.scheduleService.initSchedule(schedule);
    }

    private async _initializeTrigger(trigger: TriggerModel): Promise<void> {
        await this.triggerService.initTrigger(trigger.id);
    }

    private _syncCycle(structure: StructureModel, data: SynchronizeCycleModel): void {
        const cycleToUpdate = structure.cycles.find((cycle) => cycle.id === data.id);
        if (cycleToUpdate && data.shouldDelete) {
            const index = structure.cycles.findIndex(cy => cy.id === data.id);
            structure.cycles.splice(index, 1);
        } else if (cycleToUpdate) {
            cycleToUpdate.id = data.id;
            cycleToUpdate.name = data.name;
            cycleToUpdate.style = data.style;
            cycleToUpdate.description = data.description;
            cycleToUpdate.modePriority = data.modePriority;
            data.sequences.forEach((seqData, index) => {
                this._syncSequence(cycleToUpdate, seqData, index);
            })
        } else {
            const newCycle = new CycleModel();
            newCycle.id = data.id;
            newCycle.name = data.name;
            newCycle.style = data.style;
            newCycle.description = data.description;
            newCycle.status = ExecutableStatus.STOPPED;
            newCycle.modePriority = data.modePriority;
            newCycle.progression = null;
            data.sequences.forEach((seqData, index) => {
                this._syncSequence(newCycle, seqData, index);
            });
            structure.cycles.push(newCycle);
        }
    }

    private _syncSequence(cycleToUpdate: CycleModel, data: SynchronizeSequenceModel, index: number): void {
        const indexInStruct = cycleToUpdate.sequences.findIndex(seq => seq.id === data.id);

        if (indexInStruct !== index && indexInStruct !== -1) {
            const element = cycleToUpdate.sequences.splice(indexInStruct, 1)[0];
            cycleToUpdate.sequences.splice(index, 0, element);
        }
        const sequenceToUpdate = cycleToUpdate.sequences.find(seq => seq.id === data.id);
        if (sequenceToUpdate && data.shouldDelete) {
            const index = cycleToUpdate.sequences.findIndex(cy => cy.id === data.id);
            cycleToUpdate.sequences.splice(index, 1);
            return;
        } else if (sequenceToUpdate) {
            sequenceToUpdate.name = data.name;
            sequenceToUpdate.description = data.description;
            sequenceToUpdate.maxDuration = data.maxDuration;

            data.modules.forEach((modData) => {
                this._syncModule(sequenceToUpdate, modData);
            });
            return;
        }
        const newSequence = new SequenceModel();
        newSequence.id = data.id;
        newSequence.name = data.name;
        newSequence.description = data.description;
        newSequence.maxDuration = data.maxDuration;
        newSequence.status = ExecutableStatus.STOPPED;
        newSequence.progression = null;
        data.modules.forEach((modData) => {
            this._syncModule(newSequence, modData);
        });
        cycleToUpdate.sequences.push(newSequence);
    }

    private _syncModule(sequenceToUpdate: SequenceModel, data: SynchronizeModuleModel): void {
        const moduleToUpdate = sequenceToUpdate.modules.find(mod => mod.portNum === data.portNum);
        if (moduleToUpdate && data.shouldDelete) {
            const index = sequenceToUpdate.modules.findIndex(cy => cy.portNum === data.portNum);
            sequenceToUpdate.modules.splice(index, 1);
            return;
        } else if (moduleToUpdate) {
            return;
        }
        const newModule = new ModuleModel();
        newModule.id = data.id;
        newModule.status = ModuleStatus.OFF;
        newModule.portNum = data.portNum;
        newModule.direction = GPIODirection.OUT;
        newModule.edge = GPIOEdge.BOTH;
        newModule.configure();
        sequenceToUpdate.modules.push(newModule);
    }

    private _testNotification() {




        const serviceAccount = require('/Users/nya-perso/cleveremote/cleveremote-box/src/modules/process/domain/interfaces/cleverapp-1ea3e-firebase-adminsdk-87jpt-fc18e22031.json');

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });






    }

}
