import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { StructureService } from './configuration.service';
import { BehaviorSubject, find, Observable } from 'rxjs';
import { SynchronizeService } from './synchronize.service';
import { SensorValueModel } from '../models/sensor-value.model';
import { TriggerService } from './trigger.service';
import { ReadlineParser, SerialPort } from 'serialport';
import * as HciSocket from 'hci-socket';
import { SocketIoClientProxyService } from 'src/common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { SensorModel } from '../models/sensor.model';
import { SensorType } from '../interfaces/sensor.interface';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { forEach } from 'mathjs';
import { HttpService } from '@nestjs/axios';
import { DbService } from '@process/infrastructure/db/db.service';
import { SensorStreamer } from '../models/sensor-streamer.model';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { SensorValueRepository } from '@process/infrastructure/repositories/sensor-value.repository';
import { SensorValueEntity } from '@process/infrastructure/entities/sensor-value.entity';
import { CronJob } from 'cron';
import { SensorEntity } from '@process/infrastructure/entities/sensor.entity';

const { SHT31 } = require('sht31-node')
@Injectable()
export class SensorService {
    //sensors can be added automatically only. device id is serial number on sensor box app.
    public intervals = []
    private serialport;
    public constructor(
        private schedulerRegistry: SchedulerRegistry, 
        private configurationService: StructureService,
        private triggerService: TriggerService,
        private wsService: SocketIoClientProxyService,
        private sensorRepository: SensorRepository,
        private sensorValueRepository: SensorValueRepository,
        private readonly httpService: HttpService,
        private dbService: DbService,
        private readonly logger: Logger
    ) {


    }



    @Cron('0 0 * * *')
    async handleMidnightTask() {
        this.logger.log('midnight task triggered');
        await this.runTask();
    }

    private localTest(sensorType: SensorType) {
        const sht31 = new SHT31()
        sht31.readSensorData().then(async data => {
            await this.test(sensorType, data) 
        }).catch(console.log)
    }

    private async onModuleInit1() {
        this.logger.log('application started, checking scheduled task...');
        await this.checkAndRunTaskIfNeeded();
    }

    private valeurVersPourcentage(valeur) {
        const max = 820;
        const min = 360;

        // Clamp la valeur entre min et max
        if (valeur > max) valeur = max;
        if (valeur < min) valeur = min;

        // Calcul du pourcentage
        const pourcentage = ((max - valeur) / (max - min)) * 100;

        return Math.round(pourcentage); // arrondi à l'entier le plus proche
    }

    private async checkAndRunTaskIfNeeded() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowString = tomorrow.toISOString().split('T')[0];
        const value = await this.sensorValueRepository.get('ftmax_01');
        if ((value as SensorValueEntity)?.date !== tomorrow) {
            await this.runTask();
        }
    }

    private async runTask() {
        this.logger.log('running main weather task');

        // ➔ Ici ton vrai traitement
        // Par exemple : sauvegarder, appeler une API, etc.

        // Ensuite enregistrer la date d'exécution


        this.getWeather().subscribe({
            next: async (response) => {
                const today = response.data.daily;
                this.logger.log({ tempMax: today.temperature_2m_max[1], tempMin: today.temperature_2m_min[1] }, 'weather forecast received');
                await this.test(SensorType.FORCAST_TEMPERATURE_MAX, today.temperature_2m_max[1]);
                await this.test(SensorType.FORCAST_TEMPERATURE_MIN, today.temperature_2m_min[1]);
            },
            error: (err) => {
                this.logger.error({ status: err?.response?.status, message: err?.message }, 'weather API call failed');
            }
        });
    }

    public async initSensor(): Promise<void> {

        ///////////// i2c sensor ////////////////
        await this.onModuleInit1();


        // // Utilisation
        //const streamer = new SensorStreamer();

        // // Écouter 'tick'
        //streamer.on('tick', this.localTest.bind(this, SensorType.LOCAL_TEMPERATURE));

        // // Démarrer toutes les 2 secondes avec x1 = 10, x2 = "Début"
        // streamer.start(1000, SensorType.LOCAL_TEMPERATURE);

        // // Après 5 secondes, changer les paramètres
        // setTimeout(() => {
        //     streamer.updateParams(99, 'NouveauParam');
        // }, 5000);

        // // Et arrêter après 12 secondes
        // setTimeout(() => {
        //     streamer.stop();
        // }, 12000);
        /////////////////// i2c sensor end  ////////////
        // spi sensors //////////////////

        var Mcp3008 = require('mcp3008.js'),
            adc = new Mcp3008(),
            channel = 0;


        setInterval(() => {
            adc.read(channel, (value) => {
                //console.log('ADC value on channel ' + channel + ': ' + this.valeurVersPourcentage(value) + '%');

            });
        }, 1000);



        ////////////////////////////////
        const portList = await SerialPort.list();
        let ttys = portList.find((x) => x.path === "/dev/ttyS0");
        if (!ttys) {
            ttys = portList.find((x) => x.path === "/dev/ttyAMA0");
        }
        this.serialport = new SerialPort({ path: ttys.path, baudRate: 9600 })
        const parser = new ReadlineParser()
        this.serialport.pipe(parser);
        parser.on('data', (data) => {
            this.logger.debug({ data }, 'serial data received');
            this.test(null, data);
        });
    }

    public intScheduledSensor(taskId: string) {
        // recuperer le taskId
    }

    private getWeather(): Observable<any> {
        const coord = { lat: 34.100780850096896, lon: -6.4666017095313935 };
        const part = 'minutely,hourly,alerts';
        const APIKey = 'a4292466eac0aee6506725f3bbd60880';
        //https://api.openweathermap.org/data/3.0/onecall?lat=33.44&lon=-94.04&appid={API key}
        //return this.httpService.get(`https://api.openweathermap.org/data/2.5/onecall?lat=${coord.lat}&lon=${coord.lon}&exclude=${part}&appid=${APIKey}`);
        return this.httpService.get('https://api.open-meteo.com/v1/forecast', {
            params: {
                latitude: coord.lat,
                longitude: coord.lon,
                daily: 'temperature_2m_max,temperature_2m_min',
                timezone: 'auto'
            }
        });
        //
    }


    // public testWriteInFile(){
    //     "/etc/wpa_supplicant/wpa_supplicant.conf"
    //     network={
    //         ssid="Livebox-7950"
    //         psk="ZH44bKUeautjj4Mtpf"
    // }
    // }
    public async initialize(): Promise<void> {
        return;
    }

    public async
    async pairingSensor(id: string, type: SensorType, unit: string): Promise<SensorModel> {
        const device = this.configurationService.deviceListeners.find(x => x.deviceId === id)
        if (!device) {
            const sensorModel = new SensorModel();
            sensorModel.id = id; 
            sensorModel.name = `New sensor ${id}`;
            sensorModel.description = "new sensor description";
            sensorModel.style = {
                bgColor: "cyan.200", 
                fontColor: "blue.400", 
                iconColor: { base: "blue", icon: "#60a5fa" }
            },
                sensorModel.type = type;
            sensorModel.unit = unit;

            const savedSensor = await this.sensorRepository.save(sensorModel);
            this.configurationService.structure.sensors.push(savedSensor);
            //test if need 

            this.configurationService.deviceListeners.push({ subject: new BehaviorSubject<SensorValueModel>(null), deviceId: savedSensor.id });


            this.wsService.sendMessage({ pattern: 'box/synchronize/configuration', data: JSON.stringify({ sensor: savedSensor }) }, true).then(() => { });
            return sensorModel;
        }
        return this.configurationService.structure.sensors.find(x => x.id === device.deviceId);
    } 

    //function used to emit value when intercepts sensor values. 
    public emitReceivedData(sensorModel: SensorModel, data: string): void {
        // const st = this.configurationService.deviceListeners.find(x => x.deviceId === data.id);
        // if (st) {
        //     st.subject.next(data);
        // }
        const sensorValue = new SensorValueModel();
        sensorValue.id = sensorModel.id;
        sensorValue.value = sensorModel.getValue(data);
        sensorValue.type = 'SENSOR';
        if (sensorModel.type === SensorType.FORCAST_TEMPERATURE_MAX || sensorModel.type === SensorType.FORCAST_TEMPERATURE_MIN) {
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            sensorValue.date = tomorrow;
        }

        this.wsService.sendMessage({ pattern: 'agg/synchronize/sensor-value', data: JSON.stringify(sensorValue) }, true).then(() => { });
        this.wsService.sendMessage({ pattern: 'agg/synchronize/sensor-value', data: JSON.stringify(sensorValue) }, false).then(() => { });

        this.triggerService.onElementValueChanged.next(sensorValue)
    }

    public clearAllIntervals(): void {
        this.intervals.forEach(nIntervId => {
            clearInterval(nIntervId);
        });
    }

    private testreceivemessagehc12() {

    }

    // Fonction test avec paramètres

    private decodeData(type: SensorType, data: string): Promise<SensorModel> {

        switch (type) {
            case SensorType.LOCAL_TEMPERATURE:
                return this.pairingSensor('lt-01', type, '°');
            case SensorType.LOCAL_HUMIDITY:
                return this.pairingSensor('lh-01', type, '%');
            case SensorType.LOCAL_PRESSURE:
                return this.pairingSensor('lp-01', type, 'bar');
            case SensorType.LOCAL_FLOWMETER:
                return this.pairingSensor('lf-01', type, 'l/min');
            case SensorType.FORCAST_TEMPERATURE_MAX:
                return this.pairingSensor('ftmax-01', type, '°');
            case SensorType.FORCAST_TEMPERATURE_MIN:
                return this.pairingSensor('ftmin-01', type, '°');

            default:
                const tmpStr = data.split('i').pop().split('e')[0];
                if (tmpStr) {
                    this.logger.debug({ tmpStr }, 'decoded sensor string');
                    const arr = tmpStr.split('_');
                    const id = arr[0];
                    if (arr[0] && arr[1] && arr[2]) {

                        return this.pairingSensor(id, arr[1] as SensorType, arr[1] === 'T' ? '°' : '%');
                    }
                }
                return null;
        }
    }

    private async test(type: SensorType, data: any) {
        const sensorModel = await this.decodeData(type, data);
        this.emitReceivedData(sensorModel, data);
    }

    private async deleteCronJob(sensorId: string): Promise<void> {
        const isExists = this.schedulerRegistry.doesExist('cron', sensorId);
        if (isExists) {
            const job = this.schedulerRegistry.getCronJob(sensorId);
            job.stop();
            this.schedulerRegistry.deleteCronJob(sensorId);
            const schedule = this.configurationService.structure.sensors.find(x => x.id === sensorId);
            if (schedule) {
                await this.sensorRepository.delete(sensorId);
            }

        }
        this.logger.warn({ sensorId }, 'sensor cron job deleted');
    }


    private createScheduledSensorEvent(sensor: SensorModel, methode: () => void): SensorModel {
        let job;
        const isExists = this.schedulerRegistry.doesExist('cron', sensor.id);
        if (isExists) {
            job = this.schedulerRegistry.getCronJob(sensor.id);
            job.stop();
            this.schedulerRegistry.deleteCronJob(sensor.id);
        }
        try {
            job = new CronJob(sensor.cronPattern, methode);
            this.schedulerRegistry.addCronJob(sensor.id, job);
            job.start();
        } catch (e) {

        }

        return sensor;

    }

    public async initScheduledSensor(sensor: SensorModel, isDeleted: boolean = false, overridedMethode?: () => void): Promise<SensorModel> {

        if (isDeleted) {
            const index = this.configurationService.schedules.findIndex(x => x.id === sensor.id);
            this.configurationService.schedules.splice(index, 1);
            await this.deleteCronJob(sensor.id);
            return sensor;
        }

        this.configurationService.structure.sensors.push(sensor);

        let methode = async (): Promise<void> => {
            //// modbus read
            const value = Math.round(Math.random() * 10);
            this.emitReceivedData(sensor, value.toString());
        };

        return this.createScheduledSensorEvent(sensor, methode);
    }

    public async restartAllScheduledSensors(): Promise<void> {
        const sensors = (await this.sensorRepository.get()) as Array<SensorEntity>;
        const scheduledSensors = sensors.filter(x => x.type === SensorType.SCHEDULED);
        for (const key in scheduledSensors) {
            if (Object.hasOwnProperty.call(scheduledSensors, key)) {
                const scheduledSensor = SensorEntity.mapToModel(scheduledSensors[key]);
                const methode = async (): Promise<void> => {
                    //// modbus read
                    const value = Math.round(Math.random() * 10);
                    this.emitReceivedData(scheduledSensor, value.toString());
                };
                this.createScheduledSensorEvent(scheduledSensor, methode);
            }
        }
    }



} 