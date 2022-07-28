import { Injectable } from '@nestjs/common';
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
    public execQueue: ProcessModel[] = [];
    public constructor(
        private configurationService: ConfigurationService,
        private processService: ProcessService
    ) { }

    public getConfiguration(): Promise<StructureModel> {
        return this.configurationService.getConfiguration();
    }

    public resetAllModules(): Promise<boolean> {
        return this.processService.resetAllModules();
    }


}