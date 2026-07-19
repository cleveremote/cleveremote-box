import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { StructureService } from './configuration.service';
import { TriggerService } from './trigger.service';
import { SensorValueModel } from '../models/sensor-value.model';
import { SocketIoClientProxyService } from 'src/common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ComSensorConfigModel, ForcastSensorConfigModel, SensorModel } from '../models/sensor.model';
import { SensorType } from '../interfaces/sensor.interface';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { NotImplementedError } from '../errors/not-implemented.error';
import { SENSOR_STRATEGIES, SensorStrategy } from './sensor-strategies/sensor-strategy.interface';

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
        private readonly logger: Logger
    ) {
        this._strategies = new Map(strategies.map((strategy) => [strategy.type, strategy]));
    }

    public async initialize(): Promise<void> {
        return;
    }

    //function used to emit value when a sensor read (real or scheduled) produces a new reading.
    public emitReceivedData(sensor: SensorModel, value: number): void {
        const sensorValue = new SensorValueModel();
        sensorValue.id = sensor.id;
        sensorValue.value = value;
        sensorValue.type = 'SENSOR';
        if (sensor.type === SensorType.FORCAST) {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            sensorValue.date = tomorrow;
        }

        this._updateStructureSensorValue(sensor.id, sensorValue);

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
        const structSensor = this.configurationService.structure.sensors.find((x) => x.id === sensorId);
        if (structSensor) {
            structSensor.value = sensorValue.value;
            structSensor.date = sensorValue.date;
        }
    }

    private async _readAndEmit(sensor: SensorModel): Promise<void> {
        try {
            const results = await this._resolveStrategy(sensor.type).read(sensor);
            const children = await this.sensorRepository.getChildren(sensor.id);

            if (children.length) {
                for (let index = 0; index < children.length; index++) {
                    const childSensor = children[index];
                    const config = childSensor.config as ComSensorConfigModel;
                    const value = +(results[config.code].value * (config.scale ?? 1)).toFixed(3);
                    this.emitReceivedData(childSensor,value);
                }
            } else {
                for (const result of results) {
                    this.emitReceivedData(sensor, result.value);
                }
            }
        } catch (error) {
            this.logger.warn({ error, sensorId: sensor.id }, 'sensor read failed');
        }
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

        const isExists = this.schedulerRegistry.doesExist('cron', sensor.id);
        if (isExists) {
            this.schedulerRegistry.getCronJob(sensor.id).stop();
            this.schedulerRegistry.deleteCronJob(sensor.id);
        }
        this._scheduleCronJob(sensor);

        return sensor;
    }

    private _scheduleCronJob(sensor: SensorModel): void {
        try {
            // waitForCompletion : un read (ex. appel HTTP meteo) ne doit pas se chevaucher avec
            // le tick suivant si la lecture precedente n'est pas terminee.
            const cronPattern = (sensor.config as ForcastSensorConfigModel | ComSensorConfigModel).cronPattern;
            const job = CronJob.from({ cronTime: cronPattern, onTick: () => this._readAndEmit(sensor), waitForCompletion: true });
            this.schedulerRegistry.addCronJob(sensor.id, job);
            job.start();
        } catch (e) {
            this.logger.warn({ error: e, sensorId: sensor.id }, 'failed to schedule sensor cron job');
        }
    }

    // tout capteur (FORCAST ou COM) est desormais lu de maniere transparente via son
    // SensorStrategy, sur le rythme defini par sensor.config.cronPattern.
    public async initScheduledSensor(sensor: SensorModel, isDeleted: boolean = false): Promise<SensorModel> {

        if (isDeleted) {
            const index = this.configurationService.structure.sensors.findIndex(x => x.id === sensor.id);
            if (index !== -1) {
                this.configurationService.structure.sensors.splice(index, 1);
            }
            this._deleteCronJob(sensor.id);
            return sensor;
        }

        const index = this.configurationService.structure.sensors.findIndex(x => x.id === sensor.id);
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
