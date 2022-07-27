import { ConditionType, ExecutableAction, ExecutableMode, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';

// eslint-disable-next-line max-lines-per-function
export function CreateExecution(id: string, mode: ExecutableMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle.id = id;
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ConditionType.NOW;
    execution.function = 'string';
    execution.mode = mode;

    return execution;
}


// eslint-disable-next-line max-lines-per-function
export function CreateExecutionCycleWithWrongModuleConfig(mode: ExecutableMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle.id = 'falsyxxxxx';
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ConditionType.NOW;
    execution.function = 'string';
    execution.mode = mode;

    return execution;
}

// eslint-disable-next-line max-lines-per-function
export function CreateExecutionCycleNotExistConfig(mode: ExecutableMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle.id = 'not_exist';
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ConditionType.NOW;
    execution.function = 'string';
    execution.mode = mode;

    return execution;
}

