import { Injectable, Logger } from '@nestjs/common';
import { StructureService } from './configuration.service';
import { ProcessService } from './execution.service';
import { ScheduleService } from './schedule.service';
import { TriggerService } from './trigger.service';
import { SensorService } from './sensor.service';
import { DbService } from '@process/infrastructure/db/db.service';
import { AuthenticationService } from './authentication.service';
const network = require("node-network-manager");
import { Gpio } from 'onoff';
import { getGPIO } from 'src/common/tools/find_gipio';
@Injectable()
export class InitService {
    public constructor(
        private configurationService: StructureService,
        private authenticationService: AuthenticationService,
        private dbService: DbService,
        private processService: ProcessService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService,
        private sensorService: SensorService
    ) { }

    public async initialize(): Promise<void> {
        // network
        // .enable()
        // .then(() => console.log("network has just turned on"))
        // .then(() => network.wifiConnect("Livebox-7950", "ZH44bKUeautjj4Mtpf"))
        // .then((data) => console.log(data))  
        //.then(() => this.dbService.initialize())
        network
        .getConnectionProfilesList()
        .then((data) => console.log(data))
        .catch((error) => console.log(error));

        return this.dbService.initialize()
            .then(() => this._loadConfiguration())
            .then(() => this.authenticationService.initAuthentication())
            .then(() => this.triggerService.initilize())
            .then(() => this.sensorService.initSensor())
            .then(() => this.sensorService.initialize()) // temps for test purpose
            .then(() => this._resetAllModules())
            .then(() => this.scheduleService.restartAllSchedules())
            .then(() => this.sendReadySignal())
            
            .catch((error) => {
                Logger.error(`! initialization failed ${String(error)} `, 'initialization');
            })
    }

    private _resetAllModules(): Promise<void> {

        Logger.log('Start initialize processes 1 ...', 'initialization');
        return this.processService.resetAllModules()
            .then(() => {
                Logger.log('processes initialized', 'initialization');

            })
    }


    private async sendReadySignal(): Promise<void> {
        if (Gpio.accessible) {
            if (Gpio.accessible) {
                const gpio = await getGPIO(21);
                const led = new Gpio(gpio, 'out','both',{reconfigureDirection:true,activeLow:false});
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

        Logger.log('Start initialize processes...', 'initialization');
        return this.processService.testAllModules()
            .then(() => {
                Logger.log('processes initialized', 'initialization');
            })
    }

    private _loadConfiguration(): Promise<void> { 

        Logger.log('Start loading configuration...', 'initialization');
        return this.configurationService.getStructure()
            .then(() => {
                Logger.log('configuration loaded', 'initialization');
            });
    }

}