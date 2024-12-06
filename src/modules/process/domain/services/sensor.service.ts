import { Injectable } from '@nestjs/common';
import { StructureService } from './configuration.service';
import { BehaviorSubject, Observable } from 'rxjs';
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
const NodeBleHost = require('ble-host');
const BleManager = NodeBleHost.BleManager;
const AdvertisingDataBuilder = NodeBleHost.AdvertisingDataBuilder;
const HciErrors = NodeBleHost.HciErrors;
const AttErrors = NodeBleHost.AttErrors;
const fs = require('fs');
const deviceName = 'clv';

var transport = new HciSocket(); // connects to the first hci device on the computer, for example hci0

var options = {
    // optional properties go here
};
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
        private readonly httpService: HttpService
    ) {

        this.serialport = new SerialPort({ path: '/dev/ttyS0', baudRate: 9600 })
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
        SerialPort.list().then((x) => console.log("resultat:,", x));


        this.getWeather().subscribe((res)=> { 
            const t = res;
        })
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
        BleManager.create(transport, options, (err, manager) => {
            // err is either null or an Error object
            // if err is null, manager contains a fully initialized BleManager object
            if (err) {
                console.error(err);
                return;
            }

            var notificationCharacteristic;

            manager.gattDb.setDeviceName(deviceName);
            manager.gattDb.addServices([
                {
                    uuid: '22222222-3333-4444-5555-666666666666',
                    characteristics: [
                        {
                            uuid: '22222222-3333-4444-5555-666666666667',
                            properties: ['read', 'write'],
                            value: 'some default value' // could be a Buffer for a binary value
                        },
                        {
                            uuid: '22222222-3333-4444-5555-666666666668',
                            properties: ['read'],
                            onRead: function (connection, callback) {
                                callback(AttErrors.SUCCESS, new Date().toString());
                            }
                        },
                        {
                            uuid: '22222222-3333-4444-5555-666666666669',
                            properties: ['write'],
                            onWrite: (connection, needsResponse, value, callback) => {
                                console.log('A new value was written:', value);
                                this.buildContenteConfigFile(JSON.parse(value.toString()))

                                //fs.appendFileSync('/etc/wpa_supplicant/wpa_supplicant.conf', '#data to append');
                                callback(AttErrors.SUCCESS); // actually only needs to be called when needsResponse is true
                            }
                        },
                        notificationCharacteristic = {
                            uuid: '22222222-3333-4444-5555-66666666666A',
                            properties: ['notify'],
                            onSubscriptionChange: function (connection, notification, indication, isWrite) {
                                if (notification) {
                                    // Notifications are now enabled, so let's send something
                                    notificationCharacteristic.notify(connection, 'Sample notification');
                                }
                            }
                        }
                    ]
                }
            ]);

            const advDataBuffer = new AdvertisingDataBuilder()
                .addFlags(['leGeneralDiscoverableMode', 'brEdrNotSupported'])
                .addLocalName(/*isComplete*/ true, "a037cd1e")
                .add128BitServiceUUIDs(/*isComplete*/ true, ['22222222-3333-4444-5555-666666666666'])
                .build();
            manager.setAdvertisingData(advDataBuffer);
            // call manager.setScanResponseData(...) if scan response data is desired too
            startAdv();

            function startAdv() {
                manager.startAdvertising({/*options*/ }, connectCallback);
            }

            function connectCallback(status, conn) {
                if (status != HciErrors.SUCCESS) {
                    // Advertising could not be started for some controller-specific reason, try again after 10 seconds
                    setTimeout(startAdv, 10000);
                    return;
                }
                conn.on('disconnect', startAdv); // restart advertising after disconnect
                console.log('Connection established!', conn);
            }
        });
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

    private buildContenteConfigFile(data: { country: string, ssid: string, psk: string }) {
        //fs.appendFileSync('/etc/wpa_supplicant/wpa_supplicant.conf', '#data to append');

        // fs.readFile('wpa_nadime.conf', 'utf8', (err, content) => {
        //     let searchString = 'country=';
        //     let re = new RegExp('^.*' + searchString + '.*$', 'gm');
        //     let formatted = content.replace(re, `country=${data.country}`);

        //     fs.writeFile('wpa_nadime.conf', formatted, 'utf8', function (err) {
        //         if (err) return console.log(err);
        //     });
        // });


        const content = fs.readFileSync('wpa_nadime.conf', 'utf8');
        let searchString = 'country=';
        let re = new RegExp('^.*' + searchString + '.*$', 'gm');
        let formatted = content.replace(re, `country=${data.country}`);
        fs.writeFileSync('wpa_nadime.conf', formatted, 'utf8');
        const cfg = `\n network={\n ssid="${data.ssid}"\n psk="${data.psk}"\n priority="${1}"\n}`;
        fs.appendFileSync('wpa_nadime.conf', cfg);


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