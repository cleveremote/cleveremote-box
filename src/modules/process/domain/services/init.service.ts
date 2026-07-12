import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { StructureService } from './configuration.service';
import { ProcessService } from './execution.service';
import { ScheduleService } from './schedule.service';
import { TriggerService } from './trigger.service';
import { SensorService } from './sensor.service';
import { DbService } from '@process/infrastructure/db/db.service';
import { AuthenticationService } from './authentication.service';
import { Gpio } from 'onoff';
import { getGPIO } from 'src/common/tools/find_gipio';
import { BleService } from './ble.service';
import { ModbusTaskService } from './modbus-task.service';
import { ActuatorModel, CtrlActuatorConfigModel } from '../models/actuator.model';
import { ActuatorType } from '../interfaces/actuator-module.interface';
import { ModuleStatus } from '../interfaces/structure.interface';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ModbusFunctionName } from '../models/com-request.model';
import { CtrlActuatorStrategy } from './actuator-strategies/ctrl-actuator.strategy';

// TODO: adapter a l'installation reelle une fois la connexion Modbus AO8CH configuree
const DEFAULT_VALVE_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b80';
const DEFAULT_VALVE_TYPE = 'PROPORTIONAL';

@Injectable()
export class InitService {
    public constructor(
        private configurationService: StructureService,
        private authenticationService: AuthenticationService,
        private dbService: DbService,
        private processService: ProcessService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService,
        private sensorService: SensorService,
        private bleService: BleService,
        private modBusService: ModbusTaskService,
        private actuatorRepository: ActuatorRepository,
        private ctrlActuatorStrategy: CtrlActuatorStrategy,
        private readonly logger: Logger,
        private readonly _processService: ProcessService
    ) { }


    public async initialize(): Promise<void> {
        this.logger.log('patch/test-version-watchtowerd1234');
        // const gpioPin = new Gpio(18, 'in', 'rising', { debounceTimeout: 10 });
        // let compteurImpulsions = 0;
        // gpioPin.watch((err, value) => {
        //     if (err) {
        //       console.error('Erreur dans la lecture du GPIO', err);
        //       return;
        //     }

        //     if (value === 1) {
        //       // Lorsqu'une impulsion (flanc montant) est détectée
        //       compteurImpulsions++;
        //       console.log(`Impulsion détectée! Total des impulsions: ${compteurImpulsions}`);
        //     }
        //   });

        //   // Affiche le nombre d'impulsions toutes les secondes
        //   setInterval(() => {
        //     console.log(`Impulsions totales : ${compteurImpulsions}`); 
        //   }, 1000);

        const wrap = (name: string, fn: () => Promise<any> | void) =>
            Promise.resolve(fn()).catch((error) => { throw new Error(`[${name}] ${String(error)}`); });

        return wrap('DbService.initialize', () => this.dbService.initialize())
            .then(() => wrap('ActuatorRepository.migrateLegacyCollections', () => this.actuatorRepository.migrateLegacyCollections()))
            .then(() => wrap('StructureService.getStructure', () => this._loadConfiguration()))
            //.then(() => wrap('InitService.seedDefaultValves', () => this._seedDefaultValves()))
            .then(() => wrap('CtrlActuatorStrategy.testAo8ch', () => this._testAo8ch()))
            .then(() => wrap('BleService.initialize', () => this.bleService.initialize()))
            .then(() => wrap('AuthenticationService.initAuthentication', () => this.authenticationService.initAuthentication()))
            .then(() => wrap('TriggerService.initilize', () => this.triggerService.initilize()))
            .then(() => wrap('SensorService.initialize', () => this.sensorService.initialize())) // temps for test purpose
            .then(() => wrap('ProcessService.resetAllModules', () => this._resetAllModules()))
            .then(() => wrap('ScheduleService.restartAllSchedules', () => this.scheduleService.restartAllSchedules()))
            .then(() => wrap('SensorService.restartAllScheduledSensors', () => this.sensorService.restartAllScheduledSensors()))
            .then(() => wrap('sendReadySignal', () => this.sendReadySignal()))
            /* .then(() => {
                 return this._processService.applyInverterConfig("inverter-001", [ 
                
                     /*
                     // { "param": "F05.02", "value": 30 }                
                     // { "param": "F05.03", "value": 50 },
                     // { "param": "F05.04", "value": 2900 },
                     // { "param": "F05.05", "value": 380 },
                     // { "param": "F05.06", "value": 10 },
                     
                     
                     
                     
                     //  { "param": "F00.02", "value": 1,persist:true },
                     //  { "param": "F00.03", "value": 8,persist:true },
                     //  { "param": "F00.11", "value": 4500,persist:true },
                     //  { "param": "F00.12", "value": 3300,persist:true },
                     //  { "param": "F00.14", "value": 4250,persist:true },
                     //  { "param": "F00.15", "value": 1500,persist:true },
                     //
                     // { "param": "F01.10", "value": 0 },
                     // { "param": "F01.35", "value": 1 }, 
                     //
                     // { "param": "F02.00", "value": 1 }, 
                     // { "param": "F02.24", "value": 0 }, lié au F01.35 pour cas ou coupure reprise en prenant compte de l'etat actuelle
                     // { "param": "F02.44", "value": 1 },
                     // { "param": "F02.43", "value": 0 },
                     // 
                     //  { "param": "F03.00", "value": 50 },
                     //  { "param": "F03.01", "value": 0 },
                     //  { "param": "F03.02", "value": 450 },
                     //  { "param": "F03.03", "value": 100 },
                     //  { "param": "F03.04", "value": 1000 },
                     //  { "param": "F03.19", "value": 0x0000 } 
                     //  
                     //   { "param": "F11.00", "value": 6,persist:true},
                     //   { "param": "F11.01", "value": 0,persist:true },
                     //   { "param": "F11.03", "value": 2,persist:true },
                     //   { "param": "F11.04", "value": 100,persist:true }, //lissage de la valeur plus c'est grand environment bruité on laisse par defaut
                     //   { "param": "F11.05", "value": 100,persist:true }, 
                     
                     
                 
                         { "param": "F11.08", "value": 720,persist:true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
                         { "param": "F11.09", "value": 450,persist:true }, //avant que le pid ne prenne la main
                     
                         { "param": "F11.18", "value": 100,persist:true }, // seuil bas valeur par defaut
                     //    { "param": "F11.19", "value": 420,persist:true } // seuil haut valeur par defaut
                 
                     //  { "param": "F11.25", "value": 20 }, // seuil bas valeur par defaut
                     //  { "param": "F11.26", "value": 1 } // seuil haut valeur par defaut
                     //  { "param": "F11.27", "value": 950 }, // seuil bas valeur par defaut
                     //  { "param": "F11.28", "value": 50 } // seuil haut valeur par defaut
                 
                      { "param": "F11.29", "value": 1 },
                      { "param": "F11.30", "value": 340 },
                      { "param": "F11.31", "value": 300 },   */

            //   { "param": "F11.00", "value": 6,persist:true},
            //   { "param": "F11.01", "value": 0,persist:true },
            //   { "param": "F11.03", "value": 2,persist:true },
            /*
            { "param": "F11.04", "value": 100,persist:true }, //lissage de la valeur plus c'est grand environment bruité on laisse par defaut
               { "param": "F11.05", "value": 100,persist:true }, 
            
            
        
                { "param": "F11.08", "value": 700,persist:true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
                { "param": "F11.09", "value": 300,persist:true }, //avant que le pid ne prenne la main
            


             { "param": "F00.11", "value": 4000,persist:true },
             { "param": "F00.12", "value": 3000,persist:true },
             { "param": "F00.14", "value": 2500,persist:true },
             { "param": "F00.15", "value": 2500,persist:true }, 

             { "param": "F11.17", "value": 2, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
             { "param": "F11.18", "value": 10, persist: true }, //avant que le pid ne prenne la main
             { "param": "F11.19", "value": 300, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
             { "param": "F11.11", "value": 3000, persist: true }, //avant que le pid ne prenne la main
             { "param": "F11.12", "value": 30, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
             { "param": "F11.13", "value": 0, persist: true }, //avant que le pid ne prenne la main
             { "param": "F11.14", "value": 1500, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
             { "param": "F11.15", "value": 50, persist: true }, //avant que le pid ne prenne la main
             { "param": "F11.16", "value": 0, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15

             { "param": "F11.24", "value": 100, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15




        ])

    })*/
            .then(async () => {
                // this.modBusService.execute("task-002-bis");
                // this.modBusService.execute("task-1234", { value: 330 });
                // this._processService.applyInverterConfig("inverter-001", [

                //     { "param": "F00.11", "value": 4200,persist:true },



                // ])

                // TODO: adapter le deviceId a la connexion Modbus reelle du module Waveshare
                // "Modbus RTU IO 8CH" une fois configuree (slave relié au bus du master concerné).
                const IO_8CH_DEVICE_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b70';
                // DO4 = 4e sortie, index 0-based (registres de mode 0x1000-0x1007 et coils 0x0000-0x0007)
                const DO4_CHANNEL_INDEX = 3;
                // DI4 = 4e entrée numérique, index 0-based (Read Discrete Inputs, adresses 0x0000-0x0007)
                const DI4_CHANNEL_INDEX = 3;




                // 4) Surveille en continu l'état des 8 DO et log uniquement les changements
                //await this.modBusService.monitorDigitalOutputs(IO_8CH_DEVICE_ID);

                // 1) Configure DO4 en "Toggle mode" (registre de mode = 0x1000 + index canal, valeur 0x0002)
                await this.modBusService.testExecuteTask({
                    _id: 'io8ch-do4-set-toggle-mode',
                    deviceId: IO_8CH_DEVICE_ID,
                    name: 'IO 8CH - DO4 toggle mode',
                    config: {
                        function: ModbusFunctionName.WRITE_SINGLE_REGISTER,
                        address: 0x1000 + DO4_CHANNEL_INDEX,
                        params: {}
                    }
                }, { value: 0x0002 });

                // 2) Actionne DO4 : ON puis OFF (Write Single Coil, adresse 0x0000-0x0007)
                await this.modBusService.testExecuteTask({
                    _id: 'io8ch-do4-on',
                    deviceId: IO_8CH_DEVICE_ID,
                    name: 'IO 8CH - DO4 ON',
                    config: {
                        function: ModbusFunctionName.WRITE_SINGLE_COIL,
                        address: DO4_CHANNEL_INDEX,
                        params: {}
                    }
                }, { value: 1 });

                // Lit l'état de DO4 après le ON (Read Coils, adresse 0x0000-0x0007)
                await this.modBusService.testExecuteTask({
                    _id: 'io8ch-do4-read-after-on',
                    deviceId: IO_8CH_DEVICE_ID,
                    name: 'IO 8CH - DO4 read (after ON)',
                    config: {
                        function: ModbusFunctionName.READ_COILS,
                        address: DO4_CHANNEL_INDEX,
                        params: { length: 1 }
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 1000));

                await this.modBusService.testExecuteTask({
                    _id: 'io8ch-do4-off',
                    deviceId: IO_8CH_DEVICE_ID,
                    name: 'IO 8CH - DO4 OFF',
                    config: {
                        function: ModbusFunctionName.WRITE_SINGLE_COIL,
                        address: DO4_CHANNEL_INDEX,
                        params: {}
                    }
                }, { value: 0 });

                // Lit l'état de DO4 après le OFF (Read Coils, adresse 0x0000-0x0007)
                await this.modBusService.testExecuteTask({
                    _id: 'io8ch-do4-read-after-off',
                    deviceId: IO_8CH_DEVICE_ID,
                    name: 'IO 8CH - DO4 read (after OFF)',
                    config: {
                        function: ModbusFunctionName.READ_COILS,
                        address: DO4_CHANNEL_INDEX,
                        params: { length: 1 }
                    }
                });

                // 3) Lit l'état de DI4 (Read Discrete Inputs, adresse 0x0000-0x0007)
                await this.modBusService.testExecuteTask({
                    _id: 'io8ch-di4-read',
                    deviceId: IO_8CH_DEVICE_ID,
                    name: 'IO 8CH - DI4 read',
                    config: {
                        function: ModbusFunctionName.READ_DISCRETE_INPUTS,
                        address: DI4_CHANNEL_INDEX,
                        params: { length: 1 }
                    }
                });

                // Un appui long (5s) n'a pas besoin d'un polling agressif : 500ms suffit très
                // largement (marge x10 sur le seuil) et réduit la charge sur la passerelle.
                // await this.modBusService.monitorDigitalInputs(IO_8CH_DEVICE_ID, 500, 8, 5000, ({ channel, heldMs }) => {
                //     this.logger.log({ channel, heldMs }, 'IO 8CH - long press detected');
                // });
                await this.modBusService.monitorDigitalOutputs(IO_8CH_DEVICE_ID, 500, 8, (changes) => {
                    changes.forEach((change) => {
                        this.processService.executeModuleCycleForDigitalOutput(IO_8CH_DEVICE_ID, change.channel, change.current)
                            .catch((error) => this.logger.warn({ error, change }, 'digital output -> module cycle mapping failed'));
                    });
                });

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

    private async _seedDefaultValves(): Promise<void> {
        const defaultValves: { name: string; description: string; channel: number }[] = [
            { name: 'Injection Venturi Valve 1', description: 'Vanne proportionnelle de régulation du débit d\'injection Venturi - voie 1', channel: 1 },
            { name: 'Injection Venturi Valve 2', description: 'Vanne proportionnelle de régulation du débit d\'injection Venturi - voie 2', channel: 2 }
        ];

        for (const defaultValve of defaultValves) {
            // identifie par nom (stable), pas par id : ActuatorRepository exige un uuid valide.
            const isAlreadySeeded = this.configurationService.structure.actuators
                ?.some(actuator => actuator.type === ActuatorType.CTRL && actuator.name === defaultValve.name);
            if (isAlreadySeeded) continue;

            const valve = new ActuatorModel();
            valve.name = defaultValve.name;
            valve.description = defaultValve.description;
            valve.type = ActuatorType.CTRL;
            valve.status = ModuleStatus.OFF;
            valve.config = this._createDefaultValveConfig(defaultValve.channel);
            const saved = await this.actuatorRepository.save(valve);
            this.logger.log({ valveId: saved._id, name: saved.name }, 'default valve seeded');
        }

        await this._loadConfiguration();
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
