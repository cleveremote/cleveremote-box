import { Injectable, Logger } from '@nestjs/common';
import { StructureService } from './configuration.service';
import { ProcessService } from './execution.service';
import { ScheduleService } from './schedule.service';
import { TriggerService } from './trigger.service';
import { SensorService } from './sensor.service';
import { DbService } from '@process/infrastructure/db/db.service';

@Injectable()
export class InitService {
    public constructor(
        private configurationService: StructureService,
        private dbService: DbService,
        private processService: ProcessService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService,
        private sensorService: SensorService
    ) { }

    public initialize(): Promise<void> {
        return this.dbService.initialize()
            .then(() => this._loadConfiguration())
            .then(() => this.triggerService.initilize())
            .then(() => this.sensorService.initialize()) // temps for test purpose
            .then(() => this._resetAllModules())
            .then(() => this.scheduleService.restartAllSchedules())
            .catch((error) => {
                Logger.error(`! initialization failed ${String(error)} `, 'initialization');
            })
    }

    private _resetAllModules(): Promise<void> {

        Logger.log('Start initialize processes...', 'initialization');
        return this.processService.resetAllModules()
            .then(() => {
                Logger.log('processes initialized', 'initialization');
            })
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