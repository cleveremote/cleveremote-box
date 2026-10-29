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
import { ActuatorModel, CtrlActuatorConfigModel } from '../models/actuator.model';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { CtrlActuatorStrategy } from './actuator-strategies/ctrl-actuator.strategy';
import { ActuatorService } from './actuator.service';
import { DeviceService } from './device.service';
import { GlobalSettingsService } from './global-settings.service';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '../models/device.model';
import { ModbusFunctionName } from '../models/modbus.model';
import ModbusRTU from 'modbus-serial';
import { WaveshareDiscoveryService } from './waveshare-discovery.service';
import { RegisterMapService as RegisterMapModuleService } from '@register-map/domain/services/register-map.service';
import { ModbusBusService } from '@register-map/domain/services/modbus-bus.service';
import { DeviceCommandRepository } from '@process/infrastructure/repositories/device-command.repository';
import { DeviceCommandService } from './device-command.service';
import { ComSensorStrategy } from './sensor-strategies/com-sensor.strategy';
import { DeviceCommandModel } from '../models/device-command.model';
import { ActuatorType, ComActuatorConfigModel } from '../models/actuator.model';
import { ComSensorConfigModel, SensorModel } from '../models/sensor.model';
import { SensorType } from '../interfaces/sensor.interface';
import { outcomeValues } from '../utils/device-command.util';
import { SlaveTemplateService } from './slave-template.service';
import { DeviceConnectivityService } from './device-connectivity.service';

// TODO: adapter a l'installation reelle une fois la connexion Modbus AO8CH configuree
const DEFAULT_VALVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b80';
const DEFAULT_VALVE_TYPE = 'PROPORTIONAL';
const TEST_SLAVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b60';
// TODO: adapter aux slaves reels (kind DIGITAL_IO_8CH et PRESSURE_V1) pour _testDeviceCommands
const IO8_TEST_SLAVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b70';
const PRESSURE_TEST_SLAVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b80';

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
        private modbusBus: ModbusBusService,
        private actuatorRepository: ActuatorRepository,
        private ctrlActuatorStrategy: CtrlActuatorStrategy,
        private actuatorService: ActuatorService,
        private deviceService: DeviceService,
        private globalSettingsService: GlobalSettingsService,
        private deviceRepository: DeviceRepository,
        private waveshareDiscoveryService: WaveshareDiscoveryService,
        private readonly logger: Logger,
        private readonly _processService: ProcessService,
        private readonly registerMapModuleService: RegisterMapModuleService,
        private readonly deviceCommandRepository: DeviceCommandRepository,
        private readonly deviceCommandService: DeviceCommandService,
        private readonly comSensorStrategy: ComSensorStrategy,
        private readonly slaveTemplateService: SlaveTemplateService,
        private readonly deviceConnectivityService: DeviceConnectivityService
    ) { }


    public async initialize(): Promise<void> {
        this.logger.log('patch/test-version-watchtowerd1234');
        const wrap = (name: string, fn: () => Promise<any> | void) =>
            Promise.resolve(fn()).catch((error) => { throw new Error(`[${name}] ${String(error)}`); });


        //  return wrap('RegisterMapService.tests', () => null)
        
        //     //wrap('RegisterMapService.tests', () => this.registerMapModuleService.testUltrasonicFlowMeter()) //
        //     //.then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testInverterSi23() ))
        //     //.then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testPressureSensor() ))
        //     //.then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testSoilSensor() ))
        //     //.then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testTemperatureMoistureSensor() ))
        //     //.then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testFlowMeter() ))
        //     //.then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testIo8Channel() ))
        //     // .then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testAnalogOutput8Channel() ))
        //     .then(async () => { 

        return wrap('SlaveTemplateService.seed', () => this.slaveTemplateService.seed())
            .then(() => wrap('StructureService.getStructure', () => this._loadConfiguration()))
            .then(() => wrap('GlobalSettingsService.get', () => this.globalSettingsService.get()))
            .then(() => wrap('DeviceConnectivityService.watch', () => this.deviceConnectivityService.watch()))
            //.then(() => wrap('CtrlActuatorStrategy.testAo8ch', () => this._testAo8ch()))
            //.then(() => wrap('InitService.testBuildSlaveDeviceCommandsJson', () => this._testBuildSlaveDeviceCommandsJson()))
            .then(() => wrap('init devices', () => this.configurationService.scanMaster('8d6f3fe2-af41-405b-9523-a0a6fb589b42'))) // TODO: adapter le deviceId a la connexion Modbus reelle du module Waveshare "Modbus RTU IO 8CH" une fois configuree (slave relié au bus du master concerné).    
            //.then(() => wrap('InitService.testDeviceCommands', () => this._testDeviceCommands("eec70b4d-eddc-456a-a1be-0229663b60a3"))) 
            .then(() => wrap('RegisterMapService.tests', () => this.registerMapModuleService.testFlowMeter() ))
            
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
            //.then(() => wrap('init devices', () => this.deviceService.initAll()))
            .then(async () => {
               
//             // this.testModbusFrame('8d6f3fe2-af41-405b-9523-a0a6fb589b42', 62, ModbusFunctionName.WRITE_MULTIPLE_COILS, 0, 8,1);
//             // this.testModbusFrame('8d6f3fe2-af41-405b-9523-a0a6fb589b42', 62, ModbusFunctionName.READ_COILS, 0, 6); 

// const request = { deviceId: '8d6f3fe2-af41-405b-9523-a0a6fb589b70', blockId: 'outputs', operationId: 'setMask',value: [1, 1, 0, 0, 0, 0, 0, 1] } ;
// this.registerMapService.execute(request);

// const request1 = { deviceId: '8d6f3fe2-af41-405b-9523-a0a6fb589b70', blockId: 'outputModes', operationId: 'setAll',value: [2, 2, 2, 2, 2, 2, 2, 2] } ;
// this.registerMapService.execute(request1);

//             {"context":"testModbusFrame","masterDeviceId":"8d6f3fe2-af41-405b-9523-a0a6fb589b42","slaveId":62,"fn":"toggleCoil","address":0,"length":1,"tx":["3E 05 00 00 55 00 F7 95"],"rx":["3E 05 00 00 55 00 F7 95"],"result":{"address":0,"state":false}}
// [19:53:20.737] INFO (70814): {"context":"testModbusFrame","masterDeviceId":"8d6f3fe2-af41-405b-9523-a0a6fb589b42","slaveId":62,"fn":"readCoils","address":0,"length":8,"tx":["3E 01 00 00 00 08 38 C3"],"rx":["3E 01 01 01 9C 5C"],"result":{"data":[true,false,false,false,false,false,false,false],"buffer":{"type":"Buffer","data":[1]}}}
               
                // //  const actuator = await this.actuatorRepository.get("72347bbe-1506-4bd4-a07c-e888c62aa2bb");
                // // await this.actuatorService.execute(actuator as ActuatorModel, 50);
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
     * TEST - DeviceCommand (register map) de bout en bout : enregistre en base, sur le modèle de chaque slave,
     * les commandes IO8 outputs.set / outputs.read et pression pv.read, pilote un actuator COM
     * { deviceId, commandId, channel: 2 } ON puis OFF (via ActuatorService, comme un cycle) avec relecture des
     * sorties, puis lit un sensor COM { deviceId, commandId, field: 'pv' }. ATTENTION : la sortie CH3 de l'IO8
     * commute réellement. Ignoré (warn) si un slave n'est rattaché à aucun modèle.
     */
    private async _testDeviceCommands(io8SlaveId = IO8_TEST_SLAVE_DEVICE_ID, pressureSlaveId = PRESSURE_TEST_SLAVE_DEVICE_ID): Promise<void> {
        const modelOf = async (slaveId: string): Promise<string | undefined> =>
            ((await this.deviceRepository.get(slaveId) as DeviceModel)?.config as SlaveConfigModel)?.modelId; 
        const [io8ModelId, pressureModelId] = [await modelOf(io8SlaveId), await modelOf(pressureSlaveId)];
        if (!io8ModelId) {  // || !pressureModelId
            this.logger.warn({ io8SlaveId, io8ModelId, pressureSlaveId, pressureModelId }, 'DeviceCommand test skipped : slave sans modelId');
            return;
        }
        const save = (_id: string, modelId: string, name: string, blockId: string, operationId: string): Promise<DeviceCommandModel> =>
            this.deviceCommandRepository.save(Object.assign(new DeviceCommandModel(), { _id, modelId, name, blockId, operationId }));
        const setOutput = await save('d3c0a000-0000-4000-8000-000000000001', io8ModelId, 'IO8 sortie', 'outputs', 'set');
        const readOutputs = await save('d3c0a000-0000-4000-8000-000000000002', io8ModelId, 'IO8 lecture sorties', 'outputs', 'read');
        const readPressure = await save('d3c0a000-0000-4000-8000-000000000003', pressureModelId, 'Pression', 'pv', 'read');

        const actuator = Object.assign(new ActuatorModel(), {
            _id: 'test-device-command', name: 'IO8 CH3 (DeviceCommand)', type: ActuatorType.COM,
            config: Object.assign(new ComActuatorConfigModel(), { deviceId: io8SlaveId, actions: [{ commandId: setOutput._id, channel: 2 }] })
        });
        for (const action of [1, 0]) { 
            await this.actuatorService.execute(actuator, action);
            const states = outcomeValues(await this.deviceCommandService.execute(readOutputs, io8SlaveId)).map((v) => v.value).join('');
            this.logger.log({ action, states }, 'DeviceCommand test : IO8 outputs (CH1..CH8)');
        }

        // const sensor = Object.assign(new SensorModel(), {
        //     _id: 'test-device-command', name: 'Pression (DeviceCommand)', type: SensorType.COM,
        //     config: Object.assign(new ComSensorConfigModel(), { deviceId: pressureSlaveId, commandId: readPressure._id, field: 'pv' })
        // });
        // this.logger.log({ result: await this.comSensorStrategy.read(sensor) }, 'DeviceCommand test : sensor pression');
    }

    /**
     * TEST - construit (et logue) l'objet JSON slave -> commandes de son modèle (partagées avec les autres
     * slaves du modèle).
     */
    private async _testBuildSlaveDeviceCommandsJson(slaveId = TEST_SLAVE_DEVICE_ID): Promise<{ device: DeviceModel; deviceCommands: DeviceCommandModel[] }> {
        const slave = await this.deviceRepository.get(slaveId) as DeviceModel;
        const modelId = (slave?.config as SlaveConfigModel)?.modelId;
        const json = { device: slave, deviceCommands: modelId ? await this.deviceCommandRepository.getByModelId(modelId) : [] };
        this.logger.log(JSON.stringify(json, null, 2), 'slave -> device commands');
        return json;
    }


    /**
     * Test isolé : ouvre sa propre connexion vers le master, exécute une fonction Modbus sur
     * slaveId et renvoie les trames brutes (format RTU, CRC inclus) envoyée / reçue en hexa.
     * Passe par la file du bus (ModbusBusService) mais par aucun repository en écriture.
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
        // Passe par la file de ModbusBusService : le bus RS485 est half-duplex et partagé avec les
        // moniteurs/tâches, une requête concurrente se fait écraser (timeout).
        return this.modbusBus.runExclusive(() => this._runModbusFrame(cfg, masterDeviceId, slaveId, fn, address, length, value));
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
            error = err instanceof Error ? err.message : String(err);
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
