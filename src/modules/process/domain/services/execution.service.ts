import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { StructureInvalidError } from '../errors/structure-invalid.error';
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

    // eslint-disable-next-line max-lines-per-function
    public async execute(execution: ProcessModel): Promise<boolean> {
        await this.configurationService.getConfiguration();
        execution = this._initializeTask(execution);
        if (!execution.task) {
            throw new StructureInvalidError();
        }
        if (execution.mode === ExecutableMode.FORCE) {
            await this._resetConflictedProcesses(execution);
        } else if (execution.mode === ExecutableMode.QUEUED) {
            throw new Error('Method not implemented.');
        }

        execution.instance = execution.execute().subscribe(
            {
                next: (x) => { console.log('got value ' + x); },
                error: async (err) => {
                    console.error('something wrong occurred: ' + err);
                    await execution.reset();
                },
                complete: () => {
                    const index = this.execQueue.map(x => x.task.id).indexOf(execution.task.id);
                    this.execQueue.splice(index, 1);
                }
            }
        );

        this.execQueue.push(execution);

        return true;
    }

    private async _resetConflictedProcesses(execution): Promise<boolean> {
        const conflictedExecutables: IExecutable[] =
            await this._getConflictedExecutables(execution);
        conflictedExecutables.forEach(async (executable) => {
            const index = this.execQueue.map(x => x.task.id).indexOf(executable.id);
            this.execQueue[index].instance.unsubscribe();
            this.execQueue.splice(index, 1);
            await executable.reset();
        });

        return true;
    }

    private async _getConflictedExecutables(execution: ProcessModel): Promise<IExecutable[]> {
        const modules = execution.task.getModules();
        const conflictedExecutable: IExecutable[] = [];
        const tasksInProccess = this.execQueue.map(x => x.task);
        modules.forEach((module) => {
            tasksInProccess.forEach((task) => {
                if (task.exists(module) && !conflictedExecutable.find((x) => x.id === task.id)) {
                    conflictedExecutable.push(task);
                }
            })
        });

        return conflictedExecutable;
    }

    private _initializeTask(execution: ProcessModel): ProcessModel {
        const struct = this.configurationService.structure;
        const taskId = execution.task.id;

        const found = struct.cycles.find(x => x.id === taskId) || struct.sequences.find(x => x.id === taskId);
        execution.task = found;
        return execution;
    }
}
