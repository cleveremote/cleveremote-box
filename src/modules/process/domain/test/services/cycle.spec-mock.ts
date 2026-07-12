import { CycleModel } from '@process/domain/models/cycle.model';
import {
    CycleType,
    ExecutableStatus,
    ExecutionMode,
    ConditionsLogic,
    ProcessMode
} from '@process/domain/interfaces/executable.interface';

export function CreateCycleModel(overrides: Partial<CycleModel> = {}): CycleModel {
    const cycle = new CycleModel();
    cycle.name = overrides.name ?? 'cycle';
    cycle.type = overrides.type ?? CycleType.CYCLE;
    cycle.description = overrides.description ?? 'description';
    cycle.status = ExecutableStatus.STOPPED;
    cycle.style = { bgColor: '#ffffff', fontColor: '#000000', iconColor: { icon: 'drop', base: '#0000ff' } };
    cycle.modePriority = [{ mode: ProcessMode.MANUAL, priority: 0 }];
    cycle.executionMode = ExecutionMode.SEQUENTIAL;
    cycle.conditions = [];
    cycle.conditionsLogic = ConditionsLogic.AND;
    cycle.childCycles = [];
    cycle.parentCycleId = overrides.parentCycleId ?? null;
    return Object.assign(cycle, overrides);
}
