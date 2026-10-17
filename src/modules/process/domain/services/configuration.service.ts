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
import { randomUUID } from 'node:crypto';
import { DEVICE_RANGE_TYPE_RANGES, DeviceModel, DeviceRangeType, DeviceType, DISCOVERY_REGISTER_BY_TYPE, SlaveConfigModel, SlaveTemplate, getDeviceRangeType, DeviceKind } from '../models/device.model';
import { ModbusService } from './modbus.service';
import { Logger } from 'nestjs-pino';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComRequestModel } from '../models/com-request.model';
import { ActuatorModel, ActuatorType, ComActuatorConfigModel } from '../models/actuator.model';
import { ModuleStatus } from '../interfaces/structure.interface';
import { ComRequestType } from '../interfaces/com-request.interface';
import { DEFAULT_UNCONFIGURED_UNIT_ID } from '../utils/modbus-registers.util';

// Slave construit à partir d'un template, avec les éléments qui lui sont rattachés
type SlaveBundle = { device: DeviceModel; comRequests: ComRequestModel[]; actuators: ActuatorModel[] };

@Injectable()
export class StructureService {
    public structure: StructureModel;
    public sequences: SequenceModel[];
    public schedules: ScheduleModel[];
    public triggers: TriggerModel[];
    public deviceListeners: { subject: BehaviorSubject<SensorValueModel | ProcessValueModel>; deviceId }[] = [];

    public constructor(
        private cycleRepository: CycleRepository,
        private sensorRepository: SensorRepository,
        private deviceRepository: DeviceRepository,
        private modbusTaskRepository: ComRequestRepository,
        private eventRepository: EventRepository,
        private actuatorRepository: ActuatorRepository,
        private modbusService: ModbusService,
        private readonly logger: Logger
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
            this.deviceListeners.push({ subject: new BehaviorSubject<SensorValueModel | ProcessValueModel>(null), deviceId: cycle._id });
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

    public buildSlaveFromTemplate(template: SlaveTemplate, masterDeviceId: string, slaveId = DEFAULT_UNCONFIGURED_UNIT_ID): SlaveBundle {
        const deviceId = randomUUID();
        const device: DeviceModel = {
            _id: deviceId,
            name: this._uniqueDeviceName(template.device.name, DeviceType.SLAVE),
            description: template.device.description,
            type: DeviceType.SLAVE,
            config: {
                slaveId,
                masterDeviceId,
                kind: template.type === DeviceRangeType.INVERTER ? DeviceKind.INVERTER : DeviceKind.MODBUS_SLAVE,
                portConfig: template.device.portConfig && { ...template.device.portConfig }
            },
            deletedAt: null,
        };
        const comRequests: ComRequestModel[] = template.comRequests.map((cr) => ({
            _id: randomUUID(),
            deviceId,
            name: cr.name,
            description: cr.description,
            type: [...cr.type],
            config: structuredClone(cr.config),
            deletedAt: null,
        }));
        const actuators = template.type === DeviceRangeType.DIGITAL_IO
            ? this._buildDigitalOutputActuators(device, comRequests)
            : [];
        return { device, comRequests, actuators };
    }

    // Ajoute un suffixe incrémental (" 1", " 2", ...) si un device du même type porte déjà ce nom
    private _uniqueDeviceName(baseName: string, type: DeviceType): string {
        const existing = new Set(
            this.structure.devices
                .filter((d) => d.type === type && !d.deletedAt)
                .map((d) => d.name)
        );
        if (!existing.has(baseName)) return baseName;
        let index = 1;
        while (existing.has(`${baseName} ${index}`)) index++;
        return `${baseName} ${index}`;
    }

    // Un actuator COM par port de sortie (portNumStart -> portNumStart + portCount - 1), piloté par le comRequest DIGITAL_OUTPUT du slave
    private _buildDigitalOutputActuators(device: DeviceModel, comRequests: ComRequestModel[]): ActuatorModel[] {
        const portConfig = (device.config as SlaveConfigModel).portConfig;
        if (!portConfig) return [];
        const outputRequest = comRequests.find((cr) => cr.type.includes(ComRequestType.DIGITAL_OUTPUT));
        if (!outputRequest) {
            this.logger.warn({ deviceId: device._id }, 'no DIGITAL_OUTPUT comRequest, digital output actuators not created');
            return [];
        }
        return Array.from({ length: portConfig.portCount }, (_, i) => {
            const portNumber = portConfig.portNumStart + i;
            const config = new ComActuatorConfigModel();
            config.deviceId = device._id;
            config.actions = [{ comRequestId: outputRequest._id, portNumber }];
            return {
                _id: randomUUID(),
                status: ModuleStatus.OFF,
                name: `DO${portNumber}`,
                type: ActuatorType.COM,
                config,
                deletedAt: null
            };
        });
    }

    /**
     * Scanne un Master : pour chaque type de DiscoveryAddressRegister, lit son registre sur le
     * premier unit id de sa plage (DEVICE_RANGE_TYPE_RANGES), réservé aux modules neufs. Quand un
     * module répond, la valeur lue est son adresse : sa plage donne le type. Le module est alors
     * réadressé sur le premier slaveId libre de la plage, puis créé à partir du template du type.
     */
    public async scanMaster(masterDeviceId: string): Promise<DeviceModel[]> {
        const master = await this._getMaster(masterDeviceId);
        const existingSlaveIds = new Set(
            (await this.deviceRepository.getSlavesByMasterId(masterDeviceId))
                .map((slave) => (slave.config as SlaveConfigModel).slaveId)
        );

        const targets: { unitId: number; register: number }[] = [];
        for (const type of Object.values(DeviceRangeType)) {
            const register = DISCOVERY_REGISTER_BY_TYPE[type];
            if (register !== undefined) targets.push({ unitId: DEVICE_RANGE_TYPE_RANGES[type].min, register });
        }

        const responses = await this.modbusService.scanDiscoveryRegisters(master, targets);
        const templates = this._loadSlaveTemplates();
        const created: DeviceModel[] = [];
        for (const { unitId, register, value: address } of responses) {
            const type = getDeviceRangeType(address);
            if (!type || DISCOVERY_REGISTER_BY_TYPE[type] !== register) {
                this.logger.warn({ masterDeviceId, unitId, register, address }, 'scanned address out of the range of its register type');
                continue;
            }
            const template = templates.find((t) => t.type === type);
            if (!template) {
                this.logger.warn({ masterDeviceId, address, type }, 'no slave template for detected type');
                continue;
            }
            const { min, max } = DEVICE_RANGE_TYPE_RANGES[type];
            let newSlaveId = min + 1;
            while (newSlaveId <= max && existingSlaveIds.has(newSlaveId)) newSlaveId++;
            if (newSlaveId > max) {
                this.logger.warn({ masterDeviceId, type }, 'no free slaveId left in range');
                continue;
            }
            try {
                await this.modbusService.setSlaveAdress(master, register, unitId, newSlaveId);
            } catch (err) {
                this.logger.error({ masterDeviceId, unitId, newSlaveId, err: err instanceof Error ? err.message : String(err) }, 'slave address write failed, module left unconfigured');
                continue;
            }
            created.push((await this._saveSlave(this.buildSlaveFromTemplate(template, masterDeviceId, newSlaveId))).device);
            existingSlaveIds.add(newSlaveId);
            this.logger.log({ masterDeviceId, newSlaveId, type }, 'slave created from scan');
        }
        return created;
    }

    private async _getMaster(masterDeviceId: string): Promise<DeviceModel> {
        const master = await this.deviceRepository.get(masterDeviceId) as DeviceModel | null;
        if (!master || master.type !== DeviceType.MASTER) {
            throw new Error(`Master device ${masterDeviceId} not found or not of type MASTER`);
        }
       return master;
    }

    // Pas de transaction (Mongo standalone) : si une écriture échoue, ce qui a déjà été créé est supprimé (compensation)
    private async _saveSlave(built: SlaveBundle): Promise<SlaveBundle> {
        const device = await this.deviceRepository.save(built.device);
        const [comResults, actuatorResults] = await Promise.all([
            Promise.allSettled(built.comRequests.map((cr) => this.modbusTaskRepository.save(cr))),
            Promise.allSettled(built.actuators.map((actuator) => this.actuatorRepository.save(actuator)))
        ]);
        const failure = [...comResults, ...actuatorResults].find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failure) {
            await this._rollbackSlave(device, comResults, actuatorResults);
            throw failure.reason;
        }
        return {
            device,
            comRequests: comResults.map((r) => (r as PromiseFulfilledResult<ComRequestModel>).value),
            actuators: actuatorResults.map((r) => (r as PromiseFulfilledResult<ActuatorModel>).value)
        };
    }

    private async _rollbackSlave(
        device: DeviceModel,
        comResults: PromiseSettledResult<ComRequestModel>[],
        actuatorResults: PromiseSettledResult<ActuatorModel>[]
    ): Promise<void> {
        const savedIds = <T extends { _id: string }>(results: PromiseSettledResult<T>[]): string[] =>
            results.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled').map((r) => r.value._id);
        const rollbacks = await Promise.allSettled([
            ...savedIds(comResults).map((id) => this.modbusTaskRepository.delete(id)),
            ...savedIds(actuatorResults).map((id) => this.actuatorRepository.delete(id)),
            this.deviceRepository.delete(device._id)
        ]);
        const failed = rollbacks.filter((r) => r.status === 'rejected').length;
        if (failed) {
            this.logger.error({ deviceId: device._id, failed }, 'slave rollback incomplete, orphan documents left');
        }
    }

    private _loadSlaveTemplates(): SlaveTemplate[] {
        return JSON.parse(readFileSync(join(process.cwd(), 'slave-templates.json'), 'utf8')) as SlaveTemplate[];
    }
}
