import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { StructureService } from './configuration.service';
import { ProcessService } from './execution.service';
import { ScheduleService } from './schedule.service';
import { TriggerService } from './trigger.service';
import { SensorService } from './sensor.service';
import { AuthenticationService } from './authentication.service';
import { Gpio } from 'onoff';
import { getGPIO } from 'src/common/tools/find_gipio';
import { BleService } from './ble.service';
import { ModbusService } from './modbus.service';
import { ActuatorModel, CtrlActuatorConfigModel } from '../models/actuator.model';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { CtrlActuatorStrategy } from './actuator-strategies/ctrl-actuator.strategy';
import { ActuatorService } from './actuator.service';
import { DeviceService } from './device.service';
import { GlobalSettingsService } from './global-settings.service';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel, MasterConfigModel, MasterProtocol } from '../models/device.model';
import { ComRequestModel, ModbusFunctionName } from '../models/com-request.model';
import ModbusRTU from 'modbus-serial';
import { SynchronizeDeviceModel } from '../models/synchronize.model';
import { WaveshareDiscoveryService } from './waveshare-discovery.service';
import { RegisterMapService } from './register-map.service';

// TODO: adapter a l'installation reelle une fois la connexion Modbus AO8CH configuree
const DEFAULT_VALVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b80';
const DEFAULT_VALVE_TYPE = 'PROPORTIONAL';
const TEST_SLAVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b60';

@Injectable()
export class InitService {
    public constructor(
        private configurationService: StructureService,
        private authenticationService: AuthenticationService,
        private processService: ProcessService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService,
        private sensorService: SensorService,
        private bleService: BleService,
        private modBusService: ModbusService,
        private actuatorRepository: ActuatorRepository,
        private comRequestRepository: ComRequestRepository,
        private ctrlActuatorStrategy: CtrlActuatorStrategy,
        private actuatorService: ActuatorService,
        private deviceService: DeviceService,
        private globalSettingsService: GlobalSettingsService,
        private deviceRepository: DeviceRepository,
        private waveshareDiscoveryService: WaveshareDiscoveryService,
        private registerMapService: RegisterMapService,
        private readonly logger: Logger,
        private readonly _processService: ProcessService
    ) { }


    public async initialize(): Promise<void> {
        this.logger.log('patch/test-version-watchtowerd1234');
        const wrap = (name: string, fn: () => Promise<any> | void) =>
            Promise.resolve(fn()).catch((error) => { throw new Error(`[${name}] ${String(error)}`); });

        return wrap('StructureService.getStructure', () => this._loadConfiguration())
            .then(() => wrap('GlobalSettingsService.get', () => this.globalSettingsService.get()))
            //.then(() => wrap('CtrlActuatorStrategy.testAo8ch', () => this._testAo8ch()))
            //.then(() => wrap('InitService.testBuildSlaveComRequestsJson', () => this._testBuildSlaveComRequestsJson()))
            //.then(() => wrap('init devices', () => this.configurationService.scanMaster('8d6f3fe2-af41-405b-9523-a0a6fb589b42'))) // TODO: adapter le deviceId a la connexion Modbus reelle du module Waveshare "Modbus RTU IO 8CH" une fois configuree (slave relié au bus du master concerné).    
            //.then(() => wrap('DeviceService.watchMasterDevicesForNewSlaves', () => this.deviceService.watchMasterDevicesForNewSlaves()))
            //.then(() => wrap('InitService.testModbusFrame', () => this.testModbusFrame('<masterDeviceId>', 1, ModbusFunctionName.READ_COILS, 0, 8)))
            .then(() => wrap('WaveshareDiscoveryService.discover', () => this.waveshareDiscoveryService.discover()))
            .then(() => wrap('BleService.initialize', () => this.bleService.initialize()))
            .then(() => wrap('AuthenticationService.initAuthentication', () => this.authenticationService.initAuthentication()))
            .then(() => wrap('TriggerService.initilize', () => this.triggerService.initilize()))
            .then(() => wrap('SensorService.initialize', () => this.sensorService.initialize())) // temps for test purpose
            .then(() => wrap('ProcessService.resetAllModules', () => this._resetAllModules()))
            .then(() => wrap('ScheduleService.restartAllSchedules', () => this.scheduleService.restartAllSchedules()))
            .then(() => wrap('SensorService.restartAllScheduledSensors', () => this.sensorService.restartAllScheduledSensors()))
            .then(() => wrap('sendReadySignal', () => this.sendReadySignal()))
            .then(() => wrap('init devices', () => this.deviceService.initAll()))
            .then(async () => {
               
            // this.testModbusFrame('8d6f3fe2-af41-405b-9523-a0a6fb589b42', 62, ModbusFunctionName.WRITE_MULTIPLE_COILS, 0, 8,1);
            // this.testModbusFrame('8d6f3fe2-af41-405b-9523-a0a6fb589b42', 62, ModbusFunctionName.READ_COILS, 0, 6); 

const request = { deviceId: '8d6f3fe2-af41-405b-9523-a0a6fb589b70', blockId: 'outputs', operationId: 'setMask',value: [1, 1, 0, 0, 0, 0, 0, 1] } ;
this.registerMapService.execute(request);

const request1 = { deviceId: '8d6f3fe2-af41-405b-9523-a0a6fb589b70', blockId: 'outputModes', operationId: 'setAll',value: [2, 2, 2, 2, 2, 2, 2, 2] } ;
this.registerMapService.execute(request1);

//             {"context":"testModbusFrame","masterDeviceId":"8d6f3fe2-af41-405b-9523-a0a6fb589b42","slaveId":62,"fn":"toggleCoil","address":0,"length":1,"tx":["3E 05 00 00 55 00 F7 95"],"rx":["3E 05 00 00 55 00 F7 95"],"result":{"address":0,"state":false}}
// [19:53:20.737] INFO (70814): {"context":"testModbusFrame","masterDeviceId":"8d6f3fe2-af41-405b-9523-a0a6fb589b42","slaveId":62,"fn":"readCoils","address":0,"length":8,"tx":["3E 01 00 00 00 08 38 C3"],"rx":["3E 01 01 01 9C 5C"],"result":{"data":[true,false,false,false,false,false,false,false],"buffer":{"type":"Buffer","data":[1]}}}
               
                // TODO: adapter le deviceId a la connexion Modbus reelle du module Waveshare
                // "Modbus RTU IO 8CH" une fois configuree (slave relié au bus du master concerné).
                const IO_8CH_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b70';
                await this.modBusService.monitorDigitalOutputs(IO_8CH_DEVICE_ID, 500, 8, (changes) => {
                    changes.forEach((change) => {
                        this.processService.executeModuleCycleForDigitalOutput(IO_8CH_DEVICE_ID, change.channel, change.current)
                            .catch((error) => this.logger.warn({ error, change }, 'digital output -> module cycle mapping failed'));
                    });
                });

                //  const actuator = await this.actuatorRepository.get("72347bbe-1506-4bd4-a07c-e888c62aa2bb");
                // await this.actuatorService.execute(actuator as ActuatorModel, 50);
            })

            .catch((error) => {
                this.logger.error({ err: error, message: error?.message, stack: error?.stack }, 'initialization failed');
            })
    }

    private _resetAllModules(): Promise<void> {

        this.logger.log('Start initialize processes 1 ...');
        return this.processService.resetAllModules()
            .then(() => {
                this.logger.log('processes initialized');
            })
    }


    private async sendReadySignal(): Promise<void> {
        if (Gpio.accessible) {
            if (Gpio.accessible) {
                const gpio = await getGPIO(21);
                const led = new Gpio(gpio, 'out', 'both', { reconfigureDirection: true, activeLow: false });
                led.writeSync(1);
                await new Promise(r => setTimeout(r, 10));
                led.writeSync(0);
                await new Promise(r => setTimeout(r, 200));
                led.writeSync(1);
                await new Promise(r => setTimeout(r, 10));
                led.writeSync(0);
            }
        }
    }



    /**
     * TEST - commissionnement du module Waveshare "Modbus RTU Analog Output 8CH" utilisé par
     * les vannes proportionnelles par défaut (cf. DEFAULT_VALVE_DEVICE_ID / _seedDefaultValves) :
     * positionne son adresse esclave à 2, puis fait varier pas à pas la sortie 4-20mA de AO1
     * (channel 1, vanne "Injection Venturi Valve 1").
     */
    private async _testAo8ch(): Promise<void> {
        const AO1_CHANNEL = 1;
        //await this.ctrlActuatorStrategy.testSetDeviceAddress(DEFAULT_VALVE_DEVICE_ID, 2);
        await this.ctrlActuatorStrategy.testStepOutput(DEFAULT_VALVE_DEVICE_ID, AO1_CHANNEL);

    }

    /**
     * TEST - construit (et logue) l'objet JSON slave -> comrequests au format SynchronizeDeviceModel
     * (device + comrequests imbriqués, cf. box/synchronize/device).
     */
    private async _testBuildSlaveComRequestsJson(slaveId = TEST_SLAVE_DEVICE_ID): Promise<SynchronizeDeviceModel> {
        const slave = await this.deviceRepository.get(slaveId) as DeviceModel;
        const comRequests = await this.comRequestRepository.get() as ComRequestModel[];
        const json: SynchronizeDeviceModel = { ...slave, comrequests: comRequests.filter((request) => request.deviceId === slaveId) };
        this.logger.log(JSON.stringify(json, null, 2), 'slave -> comrequests');
        return json;
    }


    /**
     * Test isolé : ouvre sa propre connexion vers le master, exécute une fonction Modbus sur
     * slaveId et renvoie les trames brutes (format RTU, CRC inclus) envoyée / reçue en hexa.
     * Ne passe ni par la file de ModbusService ni par aucun repository en écriture.
     * - read* / writeCoils / writeRegisters / toggleCoils : length = nombre de coils/registres
     * - write* : value (défaut : true pour coils, 0 pour registres)
     */
    public async testModbusFrame(
        masterDeviceId: string,
        slaveId: number,
        fn: ModbusFunctionName,
        address = 0,
        length = 1,
        value?: number | boolean | Array<number | boolean>
    ): Promise<{ tx: string[]; rx: string[]; result?: unknown; error?: string }> {
        const master = await this.deviceRepository.get(masterDeviceId) as DeviceModel;
        if (!master) throw new Error(`testModbusFrame: master ${masterDeviceId} introuvable`);
        const cfg = master.config as MasterConfigModel;
        // Passe par la file de ModbusService : le bus RS485 est half-duplex et partagé avec les
        // moniteurs/tâches, une requête concurrente se fait écraser (timeout).
        return this.modBusService.runExclusive(() => this._runModbusFrame(cfg, masterDeviceId, slaveId, fn, address, length, value));
    }

    private async _runModbusFrame(
        cfg: MasterConfigModel,
        masterDeviceId: string,
        slaveId: number,
        fn: ModbusFunctionName,
        address: number,
        length: number,
        value?: number | boolean | Array<number | boolean>
    ): Promise<{ tx: string[]; rx: string[]; result?: unknown; error?: string }> {
        const tx: string[] = [];
        const rx: string[] = [];
        const hex = (b: Buffer): string => b.toString('hex').toUpperCase().replace(/(..)(?!$)/g, '$1 ');
        const client = new ModbusRTU();
        let result: unknown;
        let error: string;
        try {
            if (cfg.protocol === MasterProtocol.TCP) {
                await client.connectTCP(cfg.ipAddress, { port: cfg.port });
            } else {
                await client.connectRTUBuffered(cfg.path, { baudRate: cfg.baudRate || 9600 });
            }
            client.setID(slaveId);
            client.setTimeout(cfg.timeout || 2000);
            // certaines passerelles perdent la 1re trame envoyée juste après l'ouverture
            await new Promise(resolve => setTimeout(resolve, 100));
            // espionne le port de cette instance uniquement
            const port = (client as unknown as { _port: { write: (b: Buffer) => void; on: (e: string, cb: (b: Buffer) => void) => void } })._port;
            const write = port.write.bind(port);
            port.write = (b: Buffer): void => { tx.push(hex(b)); write(b); };
            port.on('data', (b: Buffer) => rx.push(hex(b)));

            // FC05 avec valeur 16 bits custom (value, défaut 0x5500 = toggle)
            const custom = Number(Array.isArray(value) ? value[0] : value ?? 0x5500);
            const toggle = (addr: number): Promise<unknown> => new Promise((resolve, reject) =>
                client.writeCustomFC(slaveId, 0x05, Buffer.from([(addr >> 8) & 0xff, addr & 0xff, (custom >> 8) & 0xff, custom & 0xff]) as unknown as Int8Array,
                    (err, res) => (err ? reject(err) : resolve(res))));
            const asArray = (def: number | boolean): Array<number | boolean> =>
                Array.isArray(value) ? value : new Array(length).fill(value ?? def);

            switch (fn) {
                case ModbusFunctionName.READ_COILS:
                case ModbusFunctionName.READ_DISCRETE_INPUTS: 
                case ModbusFunctionName.READ_HOLDING_REGISTERS:
                case ModbusFunctionName.READ_INPUT_REGISTERS:
                    result = await client[fn](address, length);
                    break;
                case ModbusFunctionName.WRITE_SINGLE_COIL:
                    result = await client.writeCoil(address, Boolean(value ?? true));
                    break;
                case ModbusFunctionName.WRITE_SINGLE_REGISTER:
                    result = await client.writeRegister(address, Number(value ?? 0));
                    break;
                case ModbusFunctionName.WRITE_MULTIPLE_COILS:
                    result = await client.writeCoils(address, asArray(true).map(Boolean));
                    break;
                case ModbusFunctionName.WRITE_MULTIPLE_REGISTERS:
                    result = await client.writeRegisters(address, asArray(0).map(Number));
                    break;
                case ModbusFunctionName.CUSTOM_SINGLE_COIL:
                    result = await toggle(address);
                    break;
                case ModbusFunctionName.CUSTOM_MULTIPLE_COILS:
                    result = [];
                    for (let i = 0; i < length; i++) (result as unknown[]).push(await toggle(address + i)); 
                    break;
                default:
                    throw new Error(`fonction non gérée: ${fn}`);
            }
        } catch (err) {
            error = err?.message ?? String(err);
        } finally {
            client.close(() => undefined);
        }
        this.logger.log({ masterDeviceId, slaveId, fn, address, length, tx, rx, result, error }, 'testModbusFrame');
        return { tx, rx, result, error };
    }

    private _createDefaultValveConfig(channel: number): CtrlActuatorConfigModel {
        const config = new CtrlActuatorConfigModel();
        config.valveType = DEFAULT_VALVE_TYPE;
        config.deviceId = DEFAULT_VALVE_DEVICE_ID;
        config.channel = channel;
        return config;
    }

    private _loadConfiguration(): Promise<void> {

        this.logger.log('Start loading configuration...');
        return this.configurationService.getStructure()
            .then(() => {
                this.logger.log('configuration loaded');
            });
    }

}
