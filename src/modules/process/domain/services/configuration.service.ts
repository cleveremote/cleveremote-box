/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { SlaveTemplateRepository } from '@process/infrastructure/repositories/slave-template.repository';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ControlLoopRepository } from '@process/infrastructure/repositories/control-loop.repository';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { ToAccountModel } from '../models/authentication.model';
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
import { CycleRunModel } from '../models/cycle-history.model';
import { BuildCycleRuns } from '../utils/cycle-history.util';
import { TranslateEventMessages } from '../utils/process-event-message.util';
import { EventPurgeResultModel, EventPurgeSkipReason } from '../models/event-purge.model';
import { ExecutableStatus } from '../interfaces/executable.interface';
import { DeviceWithCommands, SlaveTemplate } from '../models/device.model';
import { DeviceCommandModel } from '../models/device-command.model';
import { ComSensorConfigModel, SensorModel } from '../models/sensor.model';
import { SensorType } from '../interfaces/sensor.interface';
import { DeviceCommandService } from './device-command.service';
import { SlaveScanService } from './slave-provisioning/scan/slave-scan.service';
import { AutoCreationService } from './slave-provisioning/auto-creation/auto-creation.service';
import { GlobalSettingsService } from './global-settings.service';

const LAST_EVENTS_LIMIT = 50;

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
        private slaveTemplateRepository: SlaveTemplateRepository,
        private eventRepository: EventRepository,
        private actuatorRepository: ActuatorRepository,
        private deviceCommandService: DeviceCommandService,
        private slaveScanService: SlaveScanService,
        private autoCreationService: AutoCreationService,
        private controlLoopRepository: ControlLoopRepository,
        private globalSettingsService: GlobalSettingsService,
        private authenticationRepository: AuthenticationRepository
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
        structureModel.models = await this.deviceCommandService.modelsWithParams();
        this._attachSensorCommands(structureModel.sensors, structureModel.models);
        structureModel.actuators = await this.actuatorRepository.get() as StructureModel['actuators'];
        structureModel.controlLoops = await this.controlLoopRepository.get() as StructureModel['controlLoops'];
        structureModel.globalSettings = await this.globalSettingsService.get();
        const authentication = await this.authenticationRepository.get();
        structureModel.account = authentication?.id ? ToAccountModel(authentication) : null;
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

    // DeviceCommand (params resolus) et modele des sensors COM, pour l'affichage front ; un sensor enfant
    // (config.field seul) reprend ceux de son parent. Commande ou modele introuvable : champ laisse vide.
    private _attachSensorCommands(sensors: SensorModel[], templates: SlaveTemplate[]): void {
        const commands = templates.flatMap((template) => template.deviceCommands) as DeviceCommandModel[];
        const commandsById = new Map(commands.map((command) => [command._id, command]));
        const templatesById = new Map(templates.map((template) => [template._id, template]));
        const sensorsById = new Map(sensors.map((sensor) => [sensor._id, sensor]));
        for (const sensor of sensors) {
            if (sensor.type === SensorType.FORCAST) { continue; }
            const source = sensor.parentId ? sensorsById.get(sensor.parentId) : sensor;
            const command = commandsById.get((source?.config as ComSensorConfigModel | undefined)?.commandId);
            if (!command) { continue; }
            sensor.deviceCommand = command;
            const template = templatesById.get(command.modelId);
            if (template) {
                sensor.model = { _id: template._id, name: template.name, description: template.description, kind: template.kind };
            }
        }
    }

    // progression n'a de sens que pour IN_PROCCESS, meme convention que ProcessService._processProgress.
    private async _rehydrateProcessStatus(executable: CycleModel | SequenceModel): Promise<void> {
        const lastEvent = await this.eventRepository.getLastStatus(executable._id);
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

    // cycle ou deviceId absent (tous cycles) : runs (events du cycle et de ses sequences) ; capteur / sequence : events bruts
    // startDate + endDate : filtre de periode ; sinon les LAST_EVENTS_LIMIT derniers runs / events
    // messages du journal recalcules dans query.lang (historique compris)
    public async getEvents(query: { deviceId?: string; startDate?: string; endDate?: string; lang?: string }): Promise<EventModel[] | CycleRunModel[]> {
        const range = query.startDate && query.endDate
            ? { startDate: new Date(query.startDate), endDate: new Date(query.endDate) }
            : undefined;
        const cycle = query.deviceId ? this.structure?.cycles?.find((cyc) => cyc._id === query.deviceId) : undefined;
        if (query.deviceId && !cycle) {
            const events = range
                ? await this.eventRepository.getByDeviceAndDateRange(query.deviceId, range.startDate, range.endDate)
                : await this.eventRepository.getLatestByDevice(query.deviceId, LAST_EVENTS_LIMIT);
            return TranslateEventMessages(events, query.lang);
        }
        const elementIds = cycle ? [cycle._id, ...(cycle.sequences ?? []).map((seq) => seq._id)] : undefined;
        const runIds = await this.eventRepository.getRunIds({ elementIds, ...range, limit: range ? undefined : LAST_EVENTS_LIMIT });
        return this._getRuns(runIds, query.lang);
    }

    // purge des events d'un cycle (sequences comprises), d'un capteur / autre element, ou de toute la
    // collection (deviceId absent). Toujours conserves : le dernier event de chaque capteur (sa valeur est
    // rechargee au boot) et, en purge globale, les events des cycles actifs (run en cours / en attente) ;
    // un cycle actif vise directement n'est pas purge.
    public async purgeEvents(query: { deviceId?: string; before?: string }): Promise<EventPurgeResultModel> {
        const before = query.before ? new Date(query.before) : undefined;
        const cycles = this.structure?.cycles ?? [];
        const activeCycles = cycles.filter((cyc) => cyc.status && cyc.status !== ExecutableStatus.STOPPED);
        const skipped = activeCycles.map((cyc) => ({ elementId: cyc._id, name: cyc.name, reason: EventPurgeSkipReason.ACTIVE_CYCLE }));
        const cycleElementIds = (cycle: CycleModel): string[] => [cycle._id, ...(cycle.sequences ?? []).map((seq) => seq._id)];

        if (!query.deviceId) {
            const deletedCount = await this.eventRepository.purge({
                excludedElementIds: activeCycles.flatMap(cycleElementIds), keptIds: await this._lastSensorEventIds(), before
            });
            return { deletedCount, skipped };
        }
        const cycle = cycles.find((cyc) => cyc._id === query.deviceId);
        if (cycle && activeCycles.includes(cycle)) {
            return { deletedCount: 0, skipped: skipped.filter((x) => x.elementId === cycle._id) };
        }
        const elementIds = cycle ? cycleElementIds(cycle) : [query.deviceId];
        const deletedCount = await this.eventRepository.purge({ elementIds, keptIds: await this._lastSensorEventIds(elementIds), before });
        return { deletedCount, skipped: [] };
    }

    private async _lastSensorEventIds(elementIds?: string[]): Promise<string[]> {
        const sensors = (this.structure?.sensors ?? []).filter((sensor) => !elementIds || elementIds.includes(sensor._id));
        const lastEvents = await Promise.all(sensors.map((sensor) => this.eventRepository.getLast(sensor._id)));
        return lastEvents.filter(Boolean).map((event) => event._id);
    }

    // runs complets : un run commence avant startDate ou fini apres endDate garde toute sa timeline
    private async _getRuns(runIds: string[], lang: string | undefined): Promise<CycleRunModel[]> {
        return BuildCycleRuns(TranslateEventMessages(await this.eventRepository.getByRunIds(runIds), lang));
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
        if (!this.structure) {
            return [];
        }
        const cycles = (this.structure.cycles ?? []).map((cycle) => this._toProcessValue(cycle, ExecutableType.CYCLE));
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
        return (this.structure?.sensors ?? [])
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

    /**
     * Scanne un Master (SlaveScanService : détection + réadressage des modules neufs) et crée chaque
     * slave détecté depuis son template (AutoCreationService : stratégie par kind).
     * Chaque slave créé est renvoyé avec les DeviceCommand de son modèle (params résolus).
     */
    public async scanMaster(masterDeviceId: string): Promise<DeviceWithCommands[]> {
        const templates = await this.slaveTemplateRepository.get();
        const created: DeviceWithCommands[] = [];
        for await (const scanned of this.slaveScanService.scan(masterDeviceId, templates)) {
            created.push(await this.autoCreationService.createSlave(scanned, masterDeviceId, { existingDevices: this.structure.devices, templates }));
        }
        return created;
    }
}
