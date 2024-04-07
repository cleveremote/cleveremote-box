import { Injectable, Logger } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { ProcessService } from './execution.service';
import { ScheduleService } from './schedule.service';
import { TriggerService } from './trigger.service';
import { SensorService } from './sensor.service';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { DbService } from '@process/infrastructure/db/db.service';
import { forEach } from 'mathjs';
import { BehaviorSubject } from 'rxjs';
import { IExecutableState } from '../interfaces/structure-repository.interface';

@Injectable()
export class InitService {
    public constructor(
        private configurationService: ConfigurationService,
        private dbService: DbService,
        private processService: ProcessService,
        private scheduleService: ScheduleService,
        private triggerService: TriggerService,
        private sensorService: SensorService
    ) { }

    public initialize(): Promise<void> {
        return this._loadConfiguration()
            .then(() => this.dbService.initialize())
            .then(() => this._resetAllModules())
            //.then(() => this._testAllModules())
            .then(() => this.scheduleService.restartAllSchedules())
            .then(() => this.sensorService.initialize())
            .then(() => this.triggerService.initilize())

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
        return this.configurationService.getConfiguration()
            .then(() => {
                this.configurationService.structure.cycles.forEach(cycle => {
                    this.configurationService.deviceListeners.push({ subject: new BehaviorSubject<IExecutableState>(null), deviceId: cycle.id });
                });

                Logger.log('configuration loaded', 'initialization');
            });
    }

}