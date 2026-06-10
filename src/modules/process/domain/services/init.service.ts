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
            .then(() => wrap('StructureService.getStructure', () => this._loadConfiguration()))
            .then(() => wrap('BleService.initialize', () => this.bleService.initialize()))
            .then(() => wrap('AuthenticationService.initAuthentication', () => this.authenticationService.initAuthentication()))
            .then(() => wrap('TriggerService.initilize', () => this.triggerService.initilize()))
            .then(() => wrap('SensorService.initSensor', () => this.sensorService.initSensor()))
            .then(() => wrap('SensorService.initialize', () => this.sensorService.initialize())) // temps for test purpose
            .then(() => wrap('ProcessService.resetAllModules', () => this._resetAllModules()))
            .then(() => wrap('ScheduleService.restartAllSchedules', () => this.scheduleService.restartAllSchedules()))
            .then(() => wrap('SensorService.restartAllScheduledSensors', () => this.sensorService.restartAllScheduledSensors()))
            .then(() => wrap('sendReadySignal', () => this.sendReadySignal()))
            .then(() => {
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
                       { "param": "F11.04", "value": 100,persist:true }, //lissage de la valeur plus c'est grand environment bruité on laisse par defaut
                       { "param": "F11.05", "value": 100,persist:true }, 
                    
                    
                
                        { "param": "F11.08", "value": 750,persist:true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
                        { "param": "F11.09", "value": 300,persist:true }, //avant que le pid ne prenne la main
                    


                     { "param": "F00.11", "value": 4500,persist:true },
                     { "param": "F00.12", "value": 3000,persist:true },
                     { "param": "F00.14", "value": 1500,persist:true },
                     { "param": "F00.15", "value": 1500,persist:true }, 

                     { "param": "F11.17", "value": 2, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
                     { "param": "F11.18", "value": 10, persist: true }, //avant que le pid ne prenne la main
                     { "param": "F11.19", "value": 300, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
                     { "param": "F11.11", "value": 1500, persist: true }, //avant que le pid ne prenne la main
                     { "param": "F11.12", "value": 30, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
                     { "param": "F11.13", "value": 0, persist: true }, //avant que le pid ne prenne la main
                     { "param": "F11.14", "value": 1500, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15
                     { "param": "F11.15", "value": 50, persist: true }, //avant que le pid ne prenne la main
                     { "param": "F11.16", "value": 0, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15

                     { "param": "F11.24", "value": 100, persist: true }, //il faut 60 pour le ballon et 32 pour l'arosage essayer 15




                ])

            })
            .then(() => {
                //this.modBusService.execute("task-1234",{ value: 100 }); 
                this.modBusService.execute("task-1234", { value: 330 });
            })

            .catch((error) => {
                this.logger.error({ error }, 'initialization failed');
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

    private _testAllModules(): Promise<void> {

        this.logger.log('Start initialize processes...');
        return this.processService.testAllModules()
            .then(() => {
                this.logger.log('processes initialized');
            })
    }

    private _loadConfiguration(): Promise<void> {

        this.logger.log('Start loading configuration...');
        return this.configurationService.getStructure()
            .then(() => {
                this.logger.log('configuration loaded');
            });
    }

}
