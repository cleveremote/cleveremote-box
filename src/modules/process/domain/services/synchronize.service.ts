/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
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
import { ModbusConnectionConfigModel } from '../models/modbusConnectionConfig.model';
import { ModbusConnectionRepository } from '@process/infrastructure/repositories/modbusConnection.repository';
import { ModbusTaskRepository } from '@process/infrastructure/repositories/modbusTask.repository';
import { ModbusTaskConfigModel } from '../models/modbusTaskConfig.model';
import { SensorType } from '../interfaces/sensor.interface';
import { SensorService } from './sensor.service';
import { TaskModel } from '../models/task.model';
import { TaskService } from './task.service';
import { TaskRepository } from '@process/infrastructure/repositories/task.repository';
import { ExecutableAction } from '../interfaces/executable.interface';
import { ValveConfigModel } from '../models/valve.model';
import { ValveRepository } from '@process/infrastructure/repositories/valve.repository';

@Injectable()
export class SynchronizeService {
    public constructor(
        private structureRepository: StructureRepository,
        private modbusConnectionRepository: ModbusConnectionRepository,
        private modbusTaskRepository: ModbusTaskRepository,
        private cycleRepository: CycleRepository,
        private triggerRepository: TriggerRepository,
        private scheduleRepository: ScheduleRepository,
        private sensorRepository: SensorRepository,
        private taskRepository: TaskRepository,
        private valveRepository: ValveRepository,
        private configurationService: StructureService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService,
        private sensorService: SensorService,
        private taskService: TaskService,
        private readonly logger: Logger
    ) { }

    public async synchronize(structureModel: StructureModel): Promise<StructureModel> {
        this.logger.log('synchronizing structure');
        return this.structureRepository.save(structureModel).then((data) => {
            this.configurationService.structure = data;

            const cycles = this.configurationService.structure.cycles;

            let sequences: SequenceModel[] = [];
            cycles.forEach((cycle) => {
                sequences = sequences.concat(cycle.sequences);
                sequences = [...new Set([...sequences, ...cycle.sequences])];
            });
            this.configurationService.sequences = sequences;
            this.taskService.tasks = this.configurationService.structure.tasks;

            return data;
        });
    }

    public async synchronizeCycle(cycleModel: CycleModel): Promise<CycleModel> {
        const cycle = await this.cycleRepository.save(cycleModel);
        await this.configurationService.getStructure();
        for (let index = 0; index < cycle.schedules.length; index++) {
            const schedule = cycle.schedules[index];
            await this.synchronizeSchedule(schedule)
        }
        return cycle;
    }

    public async synchronizeValve(valveModel: ValveConfigModel): Promise<ValveConfigModel> {
        const valve = await this.valveRepository.save(valveModel);
        await this.configurationService.getStructure();
        return valve;
    }

    public async synchronizeModbusConnection(modbusConnectionModel: ModbusConnectionConfigModel): Promise<ModbusConnectionConfigModel> {
        const modbusConnection = await this.modbusConnectionRepository.save(modbusConnectionModel);
        await this.configurationService.getStructure();
        return modbusConnection;
    }

    public async synchronizeModbusTask(modbusConnectionModel: ModbusTaskConfigModel): Promise<ModbusTaskConfigModel> {
        const modbusConnection = await this.modbusTaskRepository.save(modbusConnectionModel);
        await this.configurationService.getStructure();
        return modbusConnection;
    }


    public async synchronizeTrigger(trigerModel: TriggerModel): Promise<TriggerModel> {
        this.logger.log({ triggerId: trigerModel.id }, 'synchronizing trigger');
        const trigger = await this.triggerRepository.save(trigerModel);
        return this.triggerService.initTrigger(trigger || trigerModel, !trigger);
    }

    public async synchronizeSchedule(scheduleModel: ScheduleModel): Promise<ScheduleModel> {
        this.logger.log({ scheduleId: scheduleModel.id }, 'synchronizing schedule');
        const schedule = await this.scheduleRepository.save(scheduleModel);
        const isDeleted = !!this.scheduleRepository.shouldDelete(schedule.id);
        if (scheduleModel.taskId) {
            const methode = async (): Promise<void> => {
                setTimeout(async () => {
                    await this.scheduleService.clearAllSchedules();
                    const task = this.configurationService.structure.tasks.find(t => t.id === scheduleModel.taskId);
                    if (task && !schedule.isPaused) {
                        await this.taskService.setActive(task, ExecutableAction.ON);
                    }
                }, schedule.cron.sunBehavior ? 0 : schedule.cron.after);
            };
            return this.scheduleService.initSchedule(schedule || scheduleModel, isDeleted, undefined, undefined, methode);
        }
        return this.scheduleService.initSchedule(schedule || scheduleModel, isDeleted);
    }

    public async synchronizeTask(taskModel: TaskModel): Promise<TaskModel> {
        const task = await this.taskRepository.save(taskModel);
        await this.configurationService.getStructure();
        for (const schedule of task.schedules) {
            await this.synchronizeSchedule(schedule);
        }
        for (const trigger of task.triggers) {
            await this.synchronizeTrigger(trigger);
        }
        this.taskService.initTask(task, false);
        return task;
    }

    public async sychronizeSensor(sensorData: SensorModel): Promise<SensorModel> {

        const sensor = await this.sensorRepository.save(sensorData);
        if (sensorData.type !== SensorType.SCHEDULED) {
            return sensor;
        } else {
            return this.sensorService.initScheduledSensor(sensor || sensorData, !!this.sensorRepository.shouldDelete(sensor.id));
        }
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
