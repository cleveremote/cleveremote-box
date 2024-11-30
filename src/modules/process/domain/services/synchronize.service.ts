/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable } from '@nestjs/common';
import { StructureRepository } from '@process/infrastructure/repositories/structure.repository';
import { CycleModel } from '../models/cycle.model';
import { ScheduleModel } from '../models/schedule.model';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';
import { StructureService } from './configuration.service';
import { ScheduleService } from './schedule.service';
import * as admin from 'firebase-admin';
import { TriggerModel } from '../models/trigger.model';
import { TriggerService } from './trigger.service';
import { SensorModel } from '../models/sensor.model';
import { CycleEntity } from '@process/infrastructure/entities/cycle.entity';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { TriggerEntity } from '@process/infrastructure/entities/trigger.entity';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';

@Injectable()
export class SynchronizeService {
    public constructor(
        private structureRepository: StructureRepository,
        private cycleRepository: CycleRepository,
        private triggerRepository: TriggerRepository,
        private scheduleRepository: ScheduleRepository,
        private sensorRepository: SensorRepository,
        private configurationService: StructureService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService
    ) { }

    public async synchronize(structureModel: StructureModel): Promise<StructureModel> {


        return this.structureRepository.save(structureModel).then((data) => {
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

    public async synchronizeCycle(cycleModel: CycleModel): Promise<CycleModel> {
        const cycle = await this.cycleRepository.save(cycleModel);
        await this.configurationService.getStructure();
        return cycle;
    }

    public async synchronizeTrigger(trigerModel: TriggerModel): Promise<TriggerModel> {
        const trigger = await this.triggerRepository.save(trigerModel);
        return this.triggerService.initTrigger(trigger || trigerModel, !trigger);
    }

    public async synchronizeSchedule(scheduleModel: ScheduleModel): Promise<ScheduleModel> {
        const schedule = await this.scheduleRepository.save(scheduleModel);
        return this.scheduleService.initSchedule(schedule || scheduleModel, !!this.scheduleRepository.shouldDelete(schedule.id));
    }

    public async sychronizeSensor(sensorData: SensorModel): Promise<SensorModel> {
        return await this.sensorRepository.save(sensorData);
    }

    private _testNotification() {
        const serviceAccount =
            require('src/modules/process/domain/interfaces/cleverapp-1ea3e-firebase-adminsdk-87jpt-fc18e22031.json');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
    }

    // sendNotification() {
    //     console.log('configuration', configuration);
    //     const message = {
    //         notification: {
    //             title: 'test title',
    //             body: 'this is test body'
    //         },
    //         token: 'c7yPELY5Rra0sHw6Fpq1Kn:APA91bFLtT1CSjQrt-boVHapdlZapc585f0Sll0fwNQAew7s1Sa8SNadYTkqvYjfpCkkgtgkerytnCmnzdQ9zdVJjQIcd8awiL6wDZykoXDNfkqrafEGT2kEUOH001u1TvZ-B-oRLZpM'
    //     }; //token c'est le token recuperer depuis l'application

    //     admin.messaging().send(message).then((response) => {
    //         console.log('message envoyé ');
    //     }).catch((error) => {
    //         console.log('message envoyé ', error);
    //     })
    // }

}
