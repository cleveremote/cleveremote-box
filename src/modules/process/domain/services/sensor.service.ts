import { Injectable } from '@nestjs/common';
import { StructureService } from './configuration.service';
import { BehaviorSubject } from 'rxjs';
import { SynchronizeService } from './synchronize.service';
import { SensorValueModel } from '../models/sensor-value.model';
import { TriggerService } from './trigger.service';
import { DelimiterParser, ReadlineParser, SerialPort } from 'serialport';
const HciSocket = require('hci-socket');
const NodeBleHost = require('ble-host');
const BleManager = NodeBleHost.BleManager;
const AdvertisingDataBuilder = NodeBleHost.AdvertisingDataBuilder;
const HciErrors = NodeBleHost.HciErrors;
const AttErrors = NodeBleHost.AttErrors;
const fs = require('fs');
const deviceName = 'MyDevice';

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
        private synchronizeService: SynchronizeService,
        private triggerService: TriggerService
    ) {

        this.serialport = new SerialPort({ path: '/dev/ttyS0', baudRate: 9600 })
        const parser = new ReadlineParser()
        this.serialport.pipe(parser)
        parser.on('data', console.log)
        SerialPort.list().then((x) => console.log("resultat,", x));
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
                            onRead: function(connection, callback) {
                                callback(AttErrors.SUCCESS, new Date().toString());
                            }
                        },
                        {
                            uuid: '22222222-3333-4444-5555-666666666669',
                            properties: ['write'],
                            onWrite: (connection, needsResponse, value, callback) => {
                                console.log('A new value was written:', value);


//fs.appendFileSync('/etc/wpa_supplicant/wpa_supplicant.conf', '#data to append');
                                callback(AttErrors.SUCCESS); // actually only needs to be called when needsResponse is true
                            }
                        },
                        notificationCharacteristic = {
                            uuid: '22222222-3333-4444-5555-66666666666A',
                            properties: ['notify'],
                            onSubscriptionChange: function(connection, notification, indication, isWrite) {
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
                                    .addLocalName(/*isComplete*/ true, deviceName)
                                    .add128BitServiceUUIDs(/*isComplete*/ true, ['22222222-3333-4444-5555-666666666666'])
                                    .build();
            manager.setAdvertisingData(advDataBuffer);
            // call manager.setScanResponseData(...) if scan response data is desired too
            startAdv();
        
            function startAdv() {
                manager.startAdvertising({/*options*/}, connectCallback);
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

        
        // serial listener 
        // all the value can come from the sensor box prog
        // const newSensor = new SensorModel();
        // newSensor.id = 'SENSOR_123';
        // newSensor.name = 'SENSOR_123';
        // newSensor.description = 'SENSOR_123';
        // newSensor.type = SensorType.MOISTURE;
        // newSensor.unit = 'sensor_unit';
        // this.synchronizeService.sychronizeSensor(newSensor);

        // const adapter = await bluetooth.defaultAdapter()
        // const lstdevices = await adapter.devices();
        // const test = await adapter.getAddress();
        // const device = await adapter.waitDevice('00:00:00:00:00:00')
        // await device.connect()
        // const gattServer = await device.gatt()
        // const service2 = await gattServer.getPrimaryService('uuid')
        // const characteristic2 = await service2.getCharacteristic('uuid')
        // await characteristic2.startNotifications()
        // characteristic2.on('valuechanged', buffer => {
        //   console.log(buffer)
        // })

       
        // const device = await adapter.waitDevice('DC:52:85:0D:C0:CD');
        // const gattServer = await device.gatt();

        // const service2 = await gattServer.getPrimaryService('DC:52:85:0D:C0:CD')
        // const characteristic2 = await service2.getCharacteristic('DC:52:85:0D:C0:CD')
        // await characteristic2.startNotifications()
        // characteristic2.on('valuechanged', buffer => {
        //     console.log(buffer)
        // })

        this.configurationService.structure?.sensors?.forEach(sensor => {
            this.configurationService.deviceListeners.push({ subject: new BehaviorSubject<SensorValueModel>(null), deviceId: sensor.id });
            const nIntervId = setInterval(() => {
                const value = Math.floor(Math.random() * (100 - 0 + 1) + 0)
                this.emitReceivedData({ id: sensor.id, value, type: 'SENSOR' });
            }, 20000);
            this.intervals.push(nIntervId);

        });
        return;
    }
    //function used to emit value when intercepts sensor values. 
    public emitReceivedData(data: SensorValueModel): void {
        // const st = this.configurationService.deviceListeners.find(x => x.deviceId === data.id);
        // if (st) {
        //     st.subject.next(data);
        // }
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