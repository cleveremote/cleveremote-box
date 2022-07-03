import { Injectable } from '@nestjs/common';
import { Length } from 'class-validator';
import { TaskInvalidError } from '../errors/task-invalid.error';
import { ExecutableAction, ExecutableMode, IExecutable } from '../interfaces/executable.interface';
import { IStructureRepository } from '../interfaces/structure-repository.interface';
import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { SequenceModel } from '../models/sequence.model';
import { ExecutionModel } from '../models/execution.model';

@Injectable()
export class ExecutionService {

    public constructor(
        private structureRepository: IStructureRepository
    ) { }

    public async execute(execution: ExecutionModel): Promise<boolean> {
        if (execution.mode === ExecutableMode.FORCE) {
            const conflictedExecutables: IExecutable[] = await this.getConflictedExecutables(execution);
            conflictedExecutables.forEach(async executable => {
                await executable.reset();
            });
        } else if (execution.mode === ExecutableMode.QUEUED) {
           
        }

        return execution.execute();
    }

    private async getConflictedExecutables(execution: ExecutionModel): Promise<IExecutable[]> {
        const modules = execution.task.getModules();
        let conflictedExecutable: IExecutable[] = [];
        const cycles = await this.structureRepository.getCycles();
        const sequences = await this.structureRepository.getSequences();

        modules.forEach(module => {
            const cyclesInconfilict = cycles.filter((cycle) => cycle.exists(module));
            conflictedExecutable = conflictedExecutable.concat(cyclesInconfilict);
            conflictedExecutable = [...new Set([...conflictedExecutable, ...cyclesInconfilict])];
            cyclesInconfilict.forEach(cycle => {
                const sequencesInconfilict = cycle.sequences.filter((sequence) => sequence.exists(module));
                conflictedExecutable = conflictedExecutable.concat(sequencesInconfilict);
                conflictedExecutable = [...new Set([...conflictedExecutable, ...sequencesInconfilict])];
            });
            const sequencesInconfilict = sequences.filter((sequence) => sequence.exists(module));
            conflictedExecutable = conflictedExecutable.concat(sequencesInconfilict);
            conflictedExecutable = [...new Set([...conflictedExecutable, ...sequencesInconfilict])];
        });

        return conflictedExecutable;
    }
}