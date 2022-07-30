import { Injectable, Logger } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { ProcessService } from './execution.service';

@Injectable()
export class InitService {
    public constructor(
        private configurationService: ConfigurationService,
        private processService: ProcessService
    ) { }

    public initialize(): Promise<void> {
        return this._loadConfiguration()
            .then(() => this._resetAllModules())
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

    private _loadConfiguration(): Promise<void> {

        Logger.log('Start loading configuration...', 'initialization');
        return this.configurationService.getConfiguration()
            .then(() => {
                Logger.log('configuration loaded', 'initialization');
            });
    }

}