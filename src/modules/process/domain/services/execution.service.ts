import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import {
    ExecutableMode,
    IExecutable
} from '../interfaces/executable.interface';
import { ProcessModel } from '../models/process.model';
import { ConfigurationService } from './configuration.service';

@Injectable()
export class ProcessService {
    public execQueue: ProcessModel[] = [];
    public constructor(private configurationService: ConfigurationService) { }

    public async execute(execution: ProcessModel): Promise<boolean> {
        await this.configurationService.getConfiguration();
        execution = this._initializeTask(execution);
        this.execQueue.push(execution);
        if (execution.mode === ExecutableMode.FORCE) {
            const conflictedExecutables: IExecutable[] =
                await this._getConflictedExecutables(execution);
            conflictedExecutables.forEach(async (executable) => {
                await executable.reset();
            });
        } else if (execution.mode === ExecutableMode.QUEUED) {
            throw new Error('Method not implemented.');
        }

        return execution.execute().then((response) => {
            const index = this.execQueue.map(x => x.task.id).indexOf(execution.task.id);
            this.execQueue.splice(index, 1);
            return response;
        });
    }

    private async _getConflictedExecutables(execution: ProcessModel): Promise<IExecutable[]> {
        console.log('test execution.task', execution.task);
        const modules = execution.task.getModules();
        const conflictedExecutable: IExecutable[] = [];
        const tasksInProccess = this.execQueue.map(x => x.task);
        modules.forEach((module) => {
            tasksInProccess.forEach((task) => {
                if (task.exists(module)) {
                    conflictedExecutable.push(task);
                }
            })
        });

        return conflictedExecutable;
    }

    private _initializeTask(execution: ProcessModel): ProcessModel {
        const struct = this.configurationService.structure;
        const taskId = execution.task.id;
        console.log('id seraching for ' + execution.task.id)
        console.log(' searching in ');
        console.log(this.configurationService.structure.cycles);
        const found = struct.cycles.find(x => x.id === taskId) || struct.sequences.find(x => x.id === taskId);
        console.log('found');
        console.log(found);
        execution.task = found;
        return execution;
    }
}
