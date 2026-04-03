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
        private readonly logger: Logger
    ) { }


    public async initialize(): Promise<void> {
        this.logger.log('patch/test-version-watchtowerd');
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
            // .then(()=> {
            //     this.modBusService.execute("task-003");
            // })

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