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

// TODO: adapter a l'installation reelle une fois la connexion Modbus AO8CH configuree
const DEFAULT_VALVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b80';
const DEFAULT_VALVE_TYPE = 'PROPORTIONAL';

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
            .then(() => wrap('BleService.initialize', () => this.bleService.initialize()))
            .then(() => wrap('AuthenticationService.initAuthentication', () => this.authenticationService.initAuthentication()))
            .then(() => wrap('TriggerService.initilize', () => this.triggerService.initilize()))
            .then(() => wrap('SensorService.initialize', () => this.sensorService.initialize())) // temps for test purpose
            .then(() => wrap('ProcessService.resetAllModules', () => this._resetAllModules()))
            .then(() => wrap('ScheduleService.restartAllSchedules', () => this.scheduleService.restartAllSchedules()))
            .then(() => wrap('SensorService.restartAllScheduledSensors', () => this.sensorService.restartAllScheduledSensors()))
            .then(() => wrap('sendReadySignal', () => this.sendReadySignal()))
            .then(() => wrap('init devices', () => this.deviceService.initAll()))
           // .then(() => wrap('DeviceService.watchMasterDevicesForNewSlaves', () => this.deviceService.watchMasterDevicesForNewSlaves()))
            .then(async () => { 
                // // TODO: adapter le deviceId a la connexion Modbus reelle du module Waveshare
                // // "Modbus RTU IO 8CH" une fois configuree (slave relié au bus du master concerné).
                // const IO_8CH_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b70';
                // await this.modBusService.monitorDigitalOutputs(IO_8CH_DEVICE_ID, 500, 8, (changes) => {
                //     changes.forEach((change) => {
                //         this.processService.executeModuleCycleForDigitalOutput(IO_8CH_DEVICE_ID, change.channel, change.current)
                //             .catch((error) => this.logger.warn({ error, change }, 'digital output -> module cycle mapping failed'));
                //     });
                // });

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
