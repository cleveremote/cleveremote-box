import { Injectable, Logger } from '@nestjs/common';
import {
    ConditionType,
    ExecutableAction,
    ExecutableMode
} from '../interfaces/executable.interface';
import { ProcessModel } from '../models/process.model';
import { StructureModel } from '../models/structure.model';
import { ConfigurationService } from './configuration.service';
import { ProcessService } from './execution.service';

@Injectable()
export class InitService {
    public constructor(
        private configurationService: ConfigurationService,
        private processService: ProcessService
    ) { }

    public initialize(): Promise<boolean> {
        return this._loadConfiguration()
            .then((_res: boolean) => _res ? this._resetAllModules() : false);
    }


    private _resetAllModules(): Promise<boolean> {

        Logger.log('Start initialize processes...', 'initialization');
        return this.processService.resetAllModules()
            .then(() => {
                Logger.log('processes initialized', 'initialization');
                return true;
            })
            .catch((error) => {
                Logger.error(`! initialize processes KO ${String(error)} `);
                return false;
            });
    }

    private _loadConfiguration(): Promise<boolean> {

        Logger.log('Start loading configuration...', 'initialization');
        return this.configurationService.getConfiguration()
            .then(() => {
                Logger.log('configuration loaded', 'initialization');
                return true;
            })
            .catch((error) => {
                Logger.error(`! loading configuration KO ${String(error)} `);
                return false;
            });
    }


}