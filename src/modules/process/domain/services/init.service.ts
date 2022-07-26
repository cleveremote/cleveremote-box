import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { delay, from, map, mergeMap, Observable, of, tap } from 'rxjs';
import { SocketIoClientProxyService } from 'src/common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ConditionType,
    ExecutableAction,
    ExecutableMode,
    ExecutableStatus,
    IExecutable
} from '../interfaces/executable.interface';
import { ModuleModel } from '../models/module.model';
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


    public async resetAllModules(): Promise<boolean> {
        const processes = this.getAllCyles();
        processes.forEach(async process => {
            await this.processService.reset(process);
        });
        return true;
    }

    public getConfiguration(): Promise<StructureModel> {
        return this.configurationService.getConfiguration();
    }

    private getAllCyles(): Array<ProcessModel> {
        const cycles = this.configurationService.structure.cycles;
        const AllProcesses: Array<ProcessModel> = [];
        cycles.forEach(cycle => {
            const process = new ProcessModel();
            process.task = cycle;
            process.action = ExecutableAction.OFF;
            process.type = ConditionType.NOW;
            process.function = 'string';
            process.mode = ExecutableMode.NORMAL;
            AllProcesses.push(process);
        });
        return AllProcesses;
    }
}