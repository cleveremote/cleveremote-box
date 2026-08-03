/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { CycleModel } from '../models/cycle.model';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';
import { ScheduleModel } from '../models/schedule.model';
import { TriggerModel } from '../models/trigger.model';
import { BehaviorSubject } from 'rxjs';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import { ExecutableType, ValueModel } from '../models/value.model';
import { EventRepository } from '@process/infrastructure/repositories/event.repository';
import { EventModel, ProcessEventData, SensorEventData } from '../models/event.model';
import { ExecutableStatus } from '../interfaces/executable.interface';

@Injectable()
export class StructureService {
    public structure: StructureModel;
    public sequences: SequenceModel[];
    public schedules: ScheduleModel[];
    public triggers: TriggerModel[];
    public deviceListeners: { subject: BehaviorSubject<SensorValueModel | ProcessValueModel>, deviceId }[] = [];

    public constructor(
        private cycleRepository: CycleRepository,
        private sensorRepository: SensorRepository,
        private deviceRepository: DeviceRepository,
        private modbusTaskRepository: ComRequestRepository,
        private eventRepository: EventRepository,
        private actuatorRepository: ActuatorRepository
    ) {
    }

    public async getStructure(): Promise<StructureModel> {
        const structureModel = new StructureModel();
        // toute la structure (cycles, tasks, sensors, modbus, inverters, valves) est
        // persistee dans Mongo via les repositories dedies ci-dessous (DbService/json-db
        // et StructureRepository ont ete decommissionnes)
        structureModel.cycles = await this.cycleRepository.get() as CycleModel[];
        structureModel.sensors = await this.sensorRepository.get() as StructureModel['sensors'];
        structureModel.devices = await this.deviceRepository.get() as StructureModel['devices'];
        structureModel.modbusTasks = await this.modbusTaskRepository.get() as StructureModel['modbusTasks'];
        structureModel.actuators = await this.actuatorRepository.get() as StructureModel['actuators'];
        this.structure = structureModel;

        // la derniere lecture connue d'un capteur ne vit qu'en Mongo (collection `events`) :
        // les cycles/sequences repartent toujours a STOPPED au boot (resetAllModules() reinitialise
        // physiquement les actionneurs), mais un capteur (ex: prevision meteo, cron quotidien) doit
        // afficher sa derniere valeur connue avant son prochain tick.
        for (const sensor of this.structure.sensors) {
            const lastEvent = await this.eventRepository.getLast(sensor._id);
            if (lastEvent) {
                sensor.value = Number((lastEvent.additionalData as SensorEventData).value);
                sensor.date = lastEvent.date;
            }
        }

        // meme raison que pour les capteurs ci-dessus : CycleModel.status/SequenceModel.status ne sont
        // jamais persistes sur le document cycle/sequence lui-meme, seul l'objet en memoire est mis a
        // jour par ProcessService. resetAllModules() republie systematiquement un evenement CYCLE (et
        // un SEQUENCE par sequence) a STOPPED au boot (cf. ProcessService._initialReset), donc getLast()
        // reflete toujours l'etat reel meme apres un crash en pleine execution.
        for (const cycle of this.structure.cycles) {
            await this._rehydrateProcessStatus(cycle);
        }

        let sequences: SequenceModel[] = [];
        let schedules: ScheduleModel[] = [];
        let triggers: TriggerModel[] = [];

        this.structure.cycles.forEach((cycle) => {
            this.deviceListeners.push({ subject: new BehaviorSubject<ProcessValueModel>(null), deviceId: cycle._id });
            sequences = sequences.concat(cycle.sequences);
            sequences = [...new Set([...sequences, ...cycle.sequences])];
            schedules = schedules.concat(cycle.schedules);
            schedules = [...new Set([...schedules, ...cycle.schedules])];
            triggers = triggers.concat(cycle.triggers);
            triggers = [...new Set([...triggers, ...cycle.triggers])];
        });

        for (const sequence of sequences) {
            await this._rehydrateProcessStatus(sequence);
        }

        this.sequences = sequences;
        this.schedules = schedules;
        this.triggers = triggers;
        this.structure.values = this.structure.sensors
            .filter((sensor) => sensor.value !== undefined)
            .map((sensor) => ({ id: sensor._id, value: sensor.value, type: 'SENSOR', date: sensor.date }));
        return this.structure;
    }

    // progression n'a de sens que pour IN_PROCCESS, meme convention que ProcessService._processProgress.
    private async _rehydrateProcessStatus(executable: CycleModel | SequenceModel): Promise<void> {
        const lastEvent = await this.eventRepository.getLast(executable._id);
        if (!lastEvent) { return; }
        const data = lastEvent.additionalData as ProcessEventData;
        executable.status = (data.status ?? data.value) as ExecutableStatus;
        executable.progression = executable.status === ExecutableStatus.IN_PROCCESS
            ? { startedAt: data.startedAt, duration: data.duration }
            : null;
    }

    public async getConfigurationWithStatus(): Promise<StructureModel> {
        // le statut des cycles/sequences est deja porte et tenu a jour en memoire sur les modeles
        // eux-memes (execution.service.ts._processProgress) ; getStructure() suffit desormais.
        return this.getStructure();
    }

    public async getEvents(query: { deviceId: string; startDate: string; endDate: string }): Promise<EventModel[]> {
        const startDate = new Date(query.startDate);
        const endDate = new Date(query.endDate);
        return this.eventRepository.getByDeviceAndDateRange(query.deviceId, startDate, endDate);
    }

    public async getStatus(type: string): Promise<ProcessValueModel[] | SensorValueModel[] | ValueModel> {
        const processes = this._buildProcessValues();
        const sensors = this._buildSensorValues();
        switch (type) {
            case 'SENSOR':
            case 'SENSORS':
                return sensors;
            case 'SEQUENCE':
                return processes.filter((x) => x.type === ExecutableType.SEQUENCE);
            case 'CYCLE':
                return processes.filter((x) => x.type === ExecutableType.CYCLE);
            default: {
                const value = new ValueModel();
                value.processes = processes;
                value.sensors = sensors;
                return value;
            }
        }
    }

    private _buildProcessValues(): ProcessValueModel[] {
        const cycles = this.structure.cycles.map((cycle) => this._toProcessValue(cycle, ExecutableType.CYCLE));
        const sequences = this.structure.getSequences().map((sequence) => this._toProcessValue(sequence, ExecutableType.SEQUENCE));
        return [...cycles, ...sequences]; 
    }

    private _toProcessValue(executable: CycleModel | SequenceModel, type: ExecutableType): ProcessValueModel {
        const value = new ProcessValueModel();
        value.id = executable._id;
        value.type = type;
        value.status = executable.status;
        if (executable.progression) {
            value.startedAt = executable.progression.startedAt;
            value.duration = executable.progression.duration;
        }
        return value;
    }

    private _buildSensorValues(): SensorValueModel[] {
        return this.structure.sensors
            .filter((sensor) => sensor.value !== undefined)
            .map((sensor) => {
                const value = new SensorValueModel();
                value.id = sensor._id;
                value.value = sensor.value;
                value.type = 'SENSOR';
                value.date = sensor.date;
                return value;
            });
    }

}
