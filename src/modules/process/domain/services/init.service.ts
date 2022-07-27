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

    public async resetAllModules(): Promise<boolean> {
        const processes = this._getAllCyles();
        processes.forEach(async process => {
            await this.processService.initialReset(process);
        });
        return true;
    }

    private _getAllCyles(): Array<ProcessModel> {
        const cycles = this.configurationService.structure.cycles;
        const AllProcesses: Array<ProcessModel> = [];
        cycles.forEach(cycle => {
            const process = new ProcessModel();
            process.cycle = cycle;
            process.action = ExecutableAction.OFF;
            process.type = ConditionType.NOW;
            process.function = 'string';
            process.mode = ExecutableMode.NORMAL;
            AllProcesses.push(process);
        });
        return AllProcesses;
    }
}