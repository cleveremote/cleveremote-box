import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { StructureService } from './configuration.service';
import { TriggerService } from './trigger.service';
import { SensorValueModel } from '../models/sensor-value.model';
import { SocketIoClientProxyService } from 'src/common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { randomUUID } from 'node:crypto';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName, IsCurrentForcastData, SensorModel } from '../models/sensor.model';
import { GENERATED_TEXTS } from 'src/common/framework/i18n/generated-texts';
import { SensorType } from '../interfaces/sensor.interface';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { NotImplementedError } from '../errors/not-implemented.error';
import { ReadResult, SENSOR_STRATEGIES, SensorStrategy } from './sensor-strategies/sensor-strategy.interface';
import { GlobalSettingsService } from './global-settings.service';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel } from '../models/device.model';
import { SlaveBundlePersister } from './slave-provisioning/auto-creation/slave-bundle.persister';

// sensors meteo crees automatiquement au demarrage : min/max (prevision J+1) relus toutes les heures,
// valeur actuelle tous les 1/4 d'heure (pas de mise a jour d'open-meteo `current`)
const DEFAULT_FORCAST_SENSORS: { forcastData: forcastDataName; cronPattern: string; text: 'current' | 'min' | 'max' }[] = [
    { forcastData: forcastDataName.TEMPERATURE_2M, cronPattern: '0 */15 * * * *', text: 'current' },
    { forcastData: forcastDataName.TEMPERATURE_2M_MIN, cronPattern: '0 0 * * * *', text: 'min' },
    { forcastData: forcastDataName.TEMPERATURE_2M_MAX, cronPattern: '0 0 * * * *', text: 'max' }
];

@Injectable()
export class SensorService {

    private readonly _strategies: Map<SensorType, SensorStrategy>;

    public constructor(
        private schedulerRegistry: SchedulerRegistry,
        private configurationService: StructureService,
        private triggerService: TriggerService,
        private wsService: SocketIoClientProxyService,
        private sensorRepository: SensorRepository,
        @Inject(SENSOR_STRATEGIES) strategies: SensorStrategy[],
        private globalSettingsService: GlobalSettingsService,
        private deviceRepository: DeviceRepository,
        private readonly logger: Logger,
        slaveBundlePersister: SlaveBundlePersister
    ) {
        this._strategies = new Map(strategies.map((strategy) => [strategy.type, strategy]));
        // patterns a recalculer dans le nouveau fuseau (et meteo relue a la nouvelle position)
        this.globalSettingsService.onLocationChanged.subscribe(() => {
            this.restartAllScheduledSensors().catch((error) => this.logger.error({ error }, 'failed to restart sensors after location change'));
        });
        // sensors créés par un scan (ou le rattrapage d'un slave) : lus sans attendre le prochain redémarrage
        slaveBundlePersister.sensorsCreated$.subscribe((sensors) => this._scheduleCreatedSensors(sensors));
    }

    private _scheduleCreatedSensors(sensors: SensorModel[]): void {
        for (const sensor of sensors) {
            this.initScheduledSensor(sensor, false)
                .catch((error) => this.logger.warn({ error, sensorId: sensor._id }, 'failed to schedule auto-created sensor'));
        }
        this.logger.log({ count: sensors.length }, 'auto-created sensors scheduled');
    }

    public async initialize(): Promise<void> {
        return;
    }

    /**
     * Crée les sensors FORCAST par défaut (température actuelle, min et max) absents. Un sensor FORCAST
     * existant pour la même donnée (créé à la main, ou supprimé par l'utilisateur) n'est ni dupliqué ni recréé.
     * Appelé avant le chargement de la structure : leur lecture est planifiée par restartAllScheduledSensors().
     */
    public async seedForcastSensors(): Promise<void> {
        const existing = new Set(await this.sensorRepository.getSeededForcastData());
        const texts = GENERATED_TEXTS[this.globalSettingsService.language];
        const created: SensorModel[] = [];
        for (const { forcastData, cronPattern, text } of DEFAULT_FORCAST_SENSORS.filter((d) => !existing.has(d.forcastData))) {
            const config = Object.assign(new ForcastSensorConfigModel(), { forcastData, cronPattern });
            const name = texts.forcastSensor[text];
            created.push(await this.sensorRepository.save(Object.assign(new SensorModel(), {
                _id: randomUUID(),
                name,
                description: name,
                type: SensorType.FORCAST,
                style: { bgColor: '#ffffff', fontColor: '#000000', iconColor: { icon: 'sensor', base: '#000000' } },
                config
            })));
        }
        if (created.length) {
            this.logger.log({ sensors: created.map((s) => ({ _id: s._id, forcastData: (s.config as ForcastSensorConfigModel).forcastData })) }, 'forcast sensors seeded');
        }
    }

    //function used to emit value when a sensor read (real or scheduled) produces a new reading.
    public emitReceivedData(sensor: SensorModel, value: number): void {
        const sensorValue = new SensorValueModel();
        sensorValue.id = sensor._id;
        sensorValue.value = value;
        sensorValue.type = 'SENSOR';
        // prevision journaliere : valeur du lendemain ; donnee actuelle : date courante
        if (sensor.type === SensorType.FORCAST && !IsCurrentForcastData((sensor.config as ForcastSensorConfigModel)?.forcastData)) {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            sensorValue.date = tomorrow;
        }

        this._updateStructureSensorValue(sensor._id, sensorValue);

        this.wsService.sendMessage({ pattern: 'agg/synchronize/sensor-value', data: JSON.stringify(sensorValue) }, true)
            .catch((err) => this.logger.warn({ err }, 'failed to send sensor value (local)'));
        this.wsService.sendMessage({ pattern: 'agg/synchronize/sensor-value', data: JSON.stringify(sensorValue) }, false)
            .catch((err) => this.logger.warn({ err }, 'failed to send sensor value (remote)'));

        this.triggerService.onElementValueChanged.next(sensorValue);
    }

    // le `sensor` recu par emitReceivedData() peut etre une instance distincte de celle tenue par
    // structure.sensors (ex: restartAllScheduledSensors() ne passe pas par structure.sensors) :
    // c'est cette derniere que getDeviceValue()/les reponses API doivent voir.
    private _updateStructureSensorValue(sensorId: string, sensorValue: SensorValueModel): void {
        const structSensor = this.configurationService.structure.sensors.find((x) => x._id === sensorId);
        if (structSensor) {
            structSensor.value = sensorValue.value;
            structSensor.date = sensorValue.date;
        }
    }

    private async _readAndEmit(sensor: SensorModel): Promise<void> {
        try {
            if (await this._isDeviceUnavailable(sensor)) {
                return;
            }
            const results = await this._resolveStrategy(sensor.type).read(sensor);
            const children = await this.sensorRepository.getChildren(sensor._id);

            if (children.length) {
                for (let index = 0; index < children.length; index++) {
                    const childSensor = children[index];
                    // erreur isolée par enfant : une voie mal configurée n'empêche pas l'émission des autres
                    try {
                        this.emitReceivedData(childSensor, this._childValue(childSensor, results));
                    } catch (error) {
                        this.logger.warn({ error, sensorId: childSensor._id, parentId: sensor._id }, 'child sensor value conversion failed');
                    }
                    //this.emitReceivedData(childSensor, Number((Math.random() * 100).toFixed(2)));
                }
            } else {
                for (const result of results) {
                this.emitReceivedData(sensor, result.value);
                //this.emitReceivedData(sensor,  Number((Math.random() * 100).toFixed(2)));
                }
            }
        } catch (error) {
            this.logger.warn({ error, sensorId: sensor._id }, 'sensor read failed');
        }
    }

    // Capteur sur un device marqué déconnecté (slave injoignable ou derrière un master injoignable, cf.
    // DeviceConnectivityService) ou en cours de suppression : pas de lecture, pour ne pas empiler des timeouts
    // sur le bus. Le polling reprend au tick suivant le retour de la connectivité. Device introuvable : lecture
    // tentée (l'échec est loggé comme avant).
    private async _isDeviceUnavailable(sensor: SensorModel): Promise<boolean> {
        const deviceId = (sensor.config as ComSensorConfigModel)?.deviceId;
        if (!deviceId) {
            return false;
        }
        if (this.deviceRepository.isPendingDeletion(deviceId)) {
            return true;
        }
        const device = await this.deviceRepository.get(deviceId) as DeviceModel | null;
        if (device?.connectivity?.connected === false) {
            this.logger.debug({ sensorId: sensor._id, deviceId }, 'sensor read skipped: device disconnected');
            return true;
        }
        return false;
    }

    // valeur du champ de l'enfant dans la lecture du parent, transformée par la stratégie de l'enfant (ex: ANALOG)
    private _childValue(childSensor: SensorModel, results: ReadResult): number {
        const config = childSensor.config as ComSensorConfigModel;
        const item = results.find((result) => result.name === config.field);
        const strategy = this._strategies.get(childSensor.type);
        return strategy?.transform ? strategy.transform(childSensor, item).value : item?.value;
    }

    private _resolveStrategy(type: SensorType): SensorStrategy {
        const strategy = this._strategies.get(type);
        if (!strategy) {
            throw new NotImplementedError(`SensorService: unsupported sensor type "${type}"`);
        }
        return strategy;
    }

    private _deleteCronJob(sensorId: string): void {
        const isExists = this.schedulerRegistry.doesExist('cron', sensorId);
        if (isExists) {
            const job = this.schedulerRegistry.getCronJob(sensorId);
            job.stop();
            this.schedulerRegistry.deleteCronJob(sensorId);
        }
        this.logger.warn({ sensorId }, 'sensor cron job deleted');
    }

    private _createScheduledSensorEvent(sensor: SensorModel): SensorModel {
        if (sensor.parentId) {
            // sensor enfant : sa valeur est derivee de la lecture du sensor parent (pas de cronPattern propre)
            return sensor;
        }

        const isExists = this.schedulerRegistry.doesExist('cron', sensor._id);
        if (isExists) {
            this.schedulerRegistry.getCronJob(sensor._id).stop();
            this.schedulerRegistry.deleteCronJob(sensor._id);
        }

        // sensor desactive : on stoppe/retire le cron existant sans en recreer un nouveau.
        if (sensor.isEnabled === false) {
            return sensor;
        }

        this._scheduleCronJob(sensor);

        return sensor;
    }

    private _scheduleCronJob(sensor: SensorModel): void {
        try {
            // waitForCompletion : un read (ex. appel HTTP meteo) ne doit pas se chevaucher avec
            // le tick suivant si la lecture precedente n'est pas terminee.
            const cronPattern = (sensor.config as ForcastSensorConfigModel | ComSensorConfigModel).cronPattern;
            const job = CronJob.from({
                cronTime: cronPattern, onTick: () => this._readAndEmit(sensor), waitForCompletion: true, timeZone: this.globalSettingsService.timeZone
            });
            this.schedulerRegistry.addCronJob(sensor._id, job);
            job.start();
        } catch (e) {
            this.logger.warn({ error: e, sensorId: sensor._id }, 'failed to schedule sensor cron job');
        }
    }

    // tout capteur (FORCAST ou COM) est desormais lu de maniere transparente via son
    // SensorStrategy, sur le rythme defini par sensor.config.cronPattern.
    public async initScheduledSensor(sensor: SensorModel, isDeleted: boolean = false): Promise<SensorModel> {

        if (isDeleted) {
            const index = this.configurationService.structure.sensors.findIndex(x => x._id === sensor._id);
            if (index !== -1) {
                this.configurationService.structure.sensors.splice(index, 1);
            }
            this._deleteCronJob(sensor._id);
            return sensor;
        }

        const index = this.configurationService.structure.sensors.findIndex(x => x._id === sensor._id);
        if (index !== -1) {
            this.configurationService.structure.sensors[index] = sensor;
        } else {
            this.configurationService.structure.sensors.push(sensor);
        }

        return this._createScheduledSensorEvent(sensor);
    }

    public async restartAllScheduledSensors(): Promise<void> {
        const sensors = (await this.sensorRepository.get()) as SensorModel[];
        for (const sensor of sensors) {
            this._createScheduledSensorEvent(sensor); 
        }
    }

}
