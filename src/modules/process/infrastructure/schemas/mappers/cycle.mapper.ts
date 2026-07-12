import { CycleModel } from '@process/domain/models/cycle.model';
import { Cycle, CycleDocument } from '../cycle.schema';
import { ConditionMapper } from './condition.mapper';
import { ChildCycleMapper } from './child-cycle.mapper';

// sequences/schedules/triggers ne sont plus embarques dans le document Cycle : ils vivent dans
// leurs propres collections (cycleId comme cle etrangere) et sont hydrates au niveau du
// repository (CycleMongooseRepository), pas ici.
export class CycleMapper {

    public static mapToModel(cycle: CycleDocument): CycleModel {
        const model = new CycleModel();
        const id = cycle._id;
        model._id = id;
        model.name = cycle.name;
        model.type = cycle.type;
        model.description = cycle.description;
        model.status = cycle.status;
        model.style = cycle.style;
        model.executionMode = cycle.executionMode;
        model.conditions = (cycle.conditions ?? []).map(ConditionMapper.mapToModel);
        model.conditionsLogic = cycle.conditionsLogic;
        model.modePriority = (cycle.modePriority ?? []).map((mp) => ({ mode: mp.mode, priority: mp.priority }));
        model.sequences = [];
        model.schedules = [];
        model.triggers = [];
        model.parentCycleId = cycle.parentCycleId ?? null;
        model.childCycles = (cycle.childCycles ?? []).map(ChildCycleMapper.mapToModel);
        model.createdAt = (cycle as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (cycle as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = cycle.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: CycleModel): Cycle {
        const cycle = new Cycle();
        cycle.name = model.name;
        cycle.type = model.type;
        cycle.description = model.description;
        cycle.status = model.status;
        cycle.style = model.style as Cycle['style'];
        cycle.executionMode = model.executionMode;
        cycle.conditions = (model.conditions ?? []).map(ConditionMapper.mapToSchema);
        cycle.conditionsLogic = model.conditionsLogic;
        cycle.modePriority = model.modePriority ?? [];
        cycle.parentCycleId = model.parentCycleId ?? null;
        cycle.childCycles = (model.childCycles ?? []).map(ChildCycleMapper.mapToSchema);
        return cycle;
    }

}
