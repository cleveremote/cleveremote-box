/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { CycleModel } from '../models/cycle.model';
import {
    SynchronizeActuatorModel,
    SynchronizeComRequestModel,
    SynchronizeCycleModel,
    SynchronizeDeviceModel,
    SynchronizeScheduleModel,
    SynchronizeSensorModel,
    SynchronizeTriggerModel
} from '../models/synchronize.model';
import { ScheduleModel } from '../models/schedule.model';
import { StructureModel } from '../models/structure.model';
import { StructureService } from './configuration.service';
import { ScheduleService } from './schedule.service';
import { TriggerModel } from '../models/trigger.model';
import { TriggerService } from './trigger.service';
import { SensorModel } from '../models/sensor.model';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { DeviceModel, SlaveConfigModel } from '../models/device.model';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ComRequestModel } from '../models/com-request.model';
import { SensorService } from './sensor.service';
import { ActuatorModel } from '../models/actuator.model';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';

@Injectable()
export class SynchronizeService {
    public constructor(
        private deviceRepository: DeviceRepository,
        private modbusTaskRepository: ComRequestRepository,
        private cycleRepository: CycleRepository,
        private sequenceRepository: SequenceRepository,
        private triggerRepository: TriggerRepository,
        private scheduleRepository: ScheduleRepository,
        private sensorRepository: SensorRepository,
        private actuatorRepository: ActuatorRepository,
        private configurationService: StructureService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService,
        private sensorService: SensorService,
        private readonly logger: Logger
    ) { }

    public async synchronize(structureModel: StructureModel): Promise<StructureModel> {
        this.logger.log('synchronizing structure');
        // toute la structure est persistee dans Mongo (remplacement complet par collection) ;
        // data part d'un StructureModel vide, immediatement ecrase champ par champ ci-dessous
        const incoming = {
            // structureModel.cycles proviennent de StructureSynchronizeDTO.mapToStructureModel(), donc
            // reellement des SynchronizeCycleModel (avec sequences: SynchronizeSequenceModel[])
            cycles: structureModel.cycles as SynchronizeCycleModel[],
            sensors: structureModel.sensors,
            modbusTasks: structureModel.modbusTasks
        };
        structureModel.cycles = [];
        structureModel.sensors = [];
        structureModel.modbusTasks = [];
        const data = new StructureModel();
        data.cycles = await this.cycleRepository.replaceAll(incoming.cycles);
        data.sensors = await this.sensorRepository.replaceAll(incoming.sensors ?? []);
        data.modbusTasks = await this.modbusTaskRepository.replaceAll(incoming.modbusTasks ?? []);
        this.configurationService.structure = data;

        return data;
    }

    public async synchronizeCycle(cycleModel: SynchronizeCycleModel): Promise<CycleModel> {
        if (cycleModel.delete) {
            await this._deleteCycle(cycleModel._id);
            return { ...cycleModel, deletedAt: new Date() } as CycleModel;
        }
        const cycle = await this.cycleRepository.save(cycleModel);
        cycle.sequences = await this.sequenceRepository.replaceForCycle(cycle._id, cycleModel.sequences ?? []);
        cycle.schedules = await this.scheduleRepository.replaceForCycle(cycle._id, cycleModel.schedules ?? []);
        cycle.triggers = await this.triggerRepository.replaceForCycle(cycle._id, cycleModel.triggers ?? []);
        await this.configurationService.getStructure();
        for (const schedule of cycle.schedules) {
            await this.scheduleService.initSchedule(schedule, false);
        }
        return cycle;
    }

    // cascade deja geree par cycleRepository.delete() (soft-delete des sequences/schedules/triggers
    // du cycle avant le cycle lui-meme) : ne pas retraiter les enfants du payload dans ce cas.
    private async _deleteCycle(id: string): Promise<void> {
        await this.cycleRepository.delete(id);
        await this.configurationService.getStructure();
    }

    public async synchronizeValve(valveModel: SynchronizeActuatorModel): Promise<ActuatorModel> {
        if (valveModel.delete) {
            await this._deleteValve(valveModel._id);
            return { ...valveModel, deletedAt: new Date() } as ActuatorModel;
        }
        const valve = await this.actuatorRepository.save(valveModel);
        await this.configurationService.getStructure();
        return valve;
    }

    private async _deleteValve(id: string): Promise<void> {
        await this.actuatorRepository.delete(id);
        await this.configurationService.getStructure();
    }

    public async synchronizeActuatorList(actuatorModels: SynchronizeActuatorModel[]): Promise<ActuatorModel[]> {
        return this.actuatorRepository.saveMany(actuatorModels);
    }

    public async synchronizeDeviceList(deviceModels: SynchronizeDeviceModel[]): Promise<DeviceModel[]> {
        for (const model of deviceModels) {
            await this._synchronizeDeviceTree(model);
        }
        await this.configurationService.getStructure();
        return this.deviceRepository.get() as Promise<DeviceModel[]>;
    }

    // cascade recursive : sauvegarde le device puis, uniquement si le champ correspondant est
    // explicitement fourni (undefined = non fourni = pas touche, retro-compat clients non migres),
    // remplace completement ses comrequests et/ou ses devices slaves imbriques.
    private async _synchronizeDeviceTree(model: SynchronizeDeviceModel): Promise<DeviceModel> {
        if (model.delete) {
            await this.deviceRepository.delete(model._id);
            return { ...model, deletedAt: new Date() } as DeviceModel;
        }
        const device = await this.deviceRepository.save(model);

        if (model.comrequests !== undefined) {
            await this.modbusTaskRepository.replaceForDevice(device._id, model.comrequests);
        }
        if (model.devices !== undefined) {
            await this._replaceChildDevices(device._id, model.devices);
        }
        return device;
    }

    // remplacement complet scope au device parent : tout slave existant absent de `childModels`
    // est soft-supprime, les autres sont sauvegardes avec masterDeviceId force sur le parent reel.
    private async _replaceChildDevices(masterId: string, childModels: SynchronizeDeviceModel[]): Promise<DeviceModel[]> {
        const existing = await this.deviceRepository.getSlavesByMasterId(masterId);
        const incomingIds = new Set(childModels.filter(child => child._id).map(child => child._id));
        for (const existingChild of existing) {
            if (!incomingIds.has(existingChild._id)) {
                await this.deviceRepository.delete(existingChild._id);
            }
        }
        const saved: DeviceModel[] = [];
        for (const childModel of childModels) {
            if (!childModel.delete) {
                (childModel.config as SlaveConfigModel).masterDeviceId = masterId;
            }
            saved.push(await this._synchronizeDeviceTree(childModel));
        }
        return saved;
    }

    public async synchronizeModbusTaskList(modbusTaskModels: SynchronizeComRequestModel[]): Promise<ComRequestModel[]> {
        const modbusTasks = await this.modbusTaskRepository.saveMany(modbusTaskModels);
        await this.configurationService.getStructure();
        return modbusTasks;
    }

    public async synchronizeTrigger(trigerModel: SynchronizeTriggerModel): Promise<TriggerModel> {
        if (trigerModel.delete) {
            await this._deleteTrigger(trigerModel.id);
            return { ...trigerModel, deletedAt: new Date() } as TriggerModel;
        }
        this.logger.log({ triggerId: trigerModel.id }, 'synchronizing trigger');
        const trigger = await this.triggerRepository.save(trigerModel);
        return this.triggerService.initTrigger(trigger || trigerModel, false);
    }

    private async _deleteTrigger(id: string): Promise<void> {
        this.logger.log({ triggerId: id }, 'deleting trigger');
        await this.triggerRepository.delete(id);
        await this.triggerService.initTrigger({ id } as TriggerModel, true);
    }

    public async synchronizeSchedule(scheduleModel: SynchronizeScheduleModel): Promise<ScheduleModel> {
        if (scheduleModel.delete) {
            await this._deleteSchedule(scheduleModel._id);
            return { ...scheduleModel, deletedAt: new Date() } as ScheduleModel;
        }
        this.logger.log({ scheduleId: scheduleModel._id }, 'synchronizing schedule');
        const schedule = await this.scheduleRepository.save(scheduleModel);
        return this.scheduleService.initSchedule(schedule || scheduleModel, false);
    }

    private async _deleteSchedule(id: string): Promise<void> {
        this.logger.log({ scheduleId: id }, 'deleting schedule');
        await this.scheduleRepository.delete(id);
        await this.scheduleService.initSchedule({ _id: id } as ScheduleModel, true);
    }

    public async sychronizeSensor(sensorData: SynchronizeSensorModel): Promise<SensorModel> {
        if (sensorData.delete) {
            await this._deleteSensor(sensorData._id);
            return { ...sensorData, deletedAt: new Date() } as SensorModel;
        }
        const sensor = await this.sensorRepository.save(sensorData);
        return this.sensorService.initScheduledSensor(sensor || sensorData, false);
    }

    private async _deleteSensor(id: string): Promise<void> {
        await this.sensorRepository.delete(id);
        await this.sensorService.initScheduledSensor({ _id: id } as SensorModel, true);
    }

}
