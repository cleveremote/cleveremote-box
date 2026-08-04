import { ProcessType, ExecutableAction, ProcessMode, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';

export function CreateExecution(id: string, mode: ProcessMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle._id = id;
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ProcessType.FORCE;
    execution.mode = mode;

    return execution;
}

export function CreateExecutionQueued(id: string, mode: ProcessMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle._id = id;
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ProcessType.QUEUED;
    execution.mode = mode;

    return execution;
}

export function CreateExecutionCycleWithWrongModuleConfig(mode: ProcessMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle._id = 'falsyxxxxx';
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ProcessType.FORCE;
    execution.mode = mode;

    return execution;
}

export function CreateExecutionCycleWithFalsySequence(mode: ProcessMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle._id = 'with_falsy_sequence';
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ProcessType.FORCE;
    execution.mode = mode;

    return execution;
}

export function CreateExecutionCycleNotExistConfig(mode: ProcessMode, action: ExecutableAction): ProcessModel {
    const execution = new ProcessModel();

    const cycle = new CycleModel();
    cycle._id = 'not_exist';
    cycle.status = ExecutableStatus.STOPPED;

    execution.cycle = cycle;
    execution.action = action;
    execution.type = ProcessType.FORCE;
    execution.mode = mode;

    return execution;
}

