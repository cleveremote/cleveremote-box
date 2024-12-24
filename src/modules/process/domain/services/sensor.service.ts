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
        private readonly httpService: HttpService,
        private dbService: DbService
    ) {

        this.getWeather().subscribe((res) => {
            const t = res;
        })
    }

    public async initSensor(): Promise<void> {

        const portList = await SerialPort.list();
        let ttys = portList.find((x) => x.path === "/dev/ttyS0");
        if (!ttys) {
            ttys = portList.find((x) => x.path === "/dev/ttyAMA0");
        }
        this.serialport = new SerialPort({ path: ttys.path, baudRate: 9600 })
        const parser = new ReadlineParser()
        this.serialport.pipe(parser);
        parser.on('data', (data) => {
            console.log(data);
            const tmpStr = data.split('i').pop().split('e')[0]
            console.log(tmpStr);
            if (tmpStr) {
                console.log(tmpStr);
                const arr = tmpStr.split('_');
                const id = arr[0];
                if (arr[0] && arr[1] && arr[2]) {
                    this.pairingSensor(id, arr[1], arr[1] === 'T' ? '°' : '%');
                    this.emitReceivedData({ id: id, value: Number(arr[2]), type: 'SENSOR' });
                }
            }
        });
    }

    private getWeather(): Observable<any> {
        const coord = { lat: 34.100780850096896, lon: -6.4666017095313935 };
        const part = 'minutely,hourly,daily,alerts';
        const APIKey = 'a4292466eac0aee6506725f3bbd60880';
        //https://api.openweathermap.org/data/3.0/onecall?lat=33.44&lon=-94.04&appid={API key}
        //return this.httpService.get(`api.openweathermap.org/data/2.5/weather?lat=${coord.lat}&lon=${coord.lon}&exclude=${part}&appid=${APIKey}`);
        return this.httpService.get(`https://api.openweathermap.org/data/2.5/weather?lat=34.100780850096896&lon=-6.4666017095313935&units=metric&appid=a4292466eac0aee6506725f3bbd60880`);
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

    public async pairingSensor(id: string, type: SensorType, unit: string): Promise<void> {
        if (!this.configurationService.deviceListeners.find(x => x.deviceId === id)) {
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
        }
    }

    //function used to emit value when intercepts sensor values. 
    public emitReceivedData(data: SensorValueModel): void {
        // const st = this.configurationService.deviceListeners.find(x => x.deviceId === data.id);
        // if (st) {
        //     st.subject.next(data);
        // }
        this.wsService.sendMessage({ pattern: 'agg/synchronize/sensor-value', data: JSON.stringify(data) }, true).then(() => { });
        this.wsService.sendMessage({ pattern: 'agg/synchronize/sensor-value', data: JSON.stringify(data) }, false).then(() => { });

        this.triggerService.onElementValueChanged.next(data)
    }

    public clearAllIntervals(): void {
        this.intervals.forEach(nIntervId => {
            clearInterval(nIntervId);
        });
    }

    private testreceivemessagehc12() {

    }
} 