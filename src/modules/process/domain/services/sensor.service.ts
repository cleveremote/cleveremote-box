import { Injectable } from '@nestjs/common';
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
import { Cron } from '@nestjs/schedule';
import { SensorValueRepository } from '@process/infrastructure/repositories/sensor-value.repository';
import { SensorValueEntity } from '@process/infrastructure/entities/sensor-value.entity';

const { SHT31 } = require('sht31-node')
@Injectable()
export class SensorService {
    //sensors can be added automatically only. device id is serial number on sensor box app.
    public intervals = []
    private serialport;
    public constructor(
        private configurationService: StructureService,
        private triggerService: TriggerService,
        private wsService: SocketIoClientProxyService,
        private sensorRepository: SensorRepository,
        private sensorValueRepository: SensorValueRepository,
        private readonly httpService: HttpService,
        private dbService: DbService
    ) {


    }



    @Cron('0 0 * * *')
    async handleMidnightTask() {
        console.log('🎯 Exécution planifiée à minuit');
        await this.runTask();
    }

    private localTest(sensorType: SensorType) {
        const sht31 = new SHT31()
        sht31.readSensorData().then(async data => {
            await this.test(sensorType, data)
        }).catch(console.log)
    }

    private async onModuleInit1() {
        console.log('🚀 Application démarrée, vérification de la tâche...');
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
        console.log('🛠️ Exécution de la tâche principale...');

        // ➔ Ici ton vrai traitement
        // Par exemple : sauvegarder, appeler une API, etc.

        // Ensuite enregistrer la date d'exécution


        this.getWeather().subscribe(async (response) => {
            const today = response.data.daily;
            console.log('Prévisions météo :');
            console.log(`Température Max : ${today.temperature_2m_max[1]}°C`);
            console.log(`Température Min : ${today.temperature_2m_min[1]}°C`);
            await this.test(SensorType.FORCAST_TEMPERATURE_MAX, today.temperature_2m_max[1]);
            await this.test(SensorType.FORCAST_TEMPERATURE_MIN, today.temperature_2m_min[1]);
        })
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
                adc.read(channel,  (value) => {
                    console.log('ADC value on channel ' + channel + ': ' + this.valeurVersPourcentage(value)+'%');
                    
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
            this.test(null, data);
            console.log(data);
        });
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
                    console.log(tmpStr);
                    const arr = tmpStr.split('_');
                    const id = arr[0];
                    if (arr[0] && arr[1] && arr[2]) {
                        return this.pairingSensor(id, SensorType[arr[1]], arr[1] === 'T' ? '°' : '%');
                    }
                }
                return null;
        }
    }

    private async test(type: SensorType, data: any) {
        const sensorModel = await this.decodeData(type, data);
        this.emitReceivedData(sensorModel, data);
    }


} 