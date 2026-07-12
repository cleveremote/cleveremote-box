import { ChildCycleRef } from '@process/domain/models/cycle.model';
import { ChildCycle } from '../child-cycle.schema';

export class ChildCycleMapper {

    public static mapToModel(childCycle: ChildCycle): ChildCycleRef {
        return {
            cycleId: childCycle.cycleId,
            config: {
                order: childCycle.config.order,
                waitForCompletion: childCycle.config.waitForCompletion,
                delayBefore: childCycle.config.delayBefore,
                delayAfter: childCycle.config.delayAfter,
                isSkipped: childCycle.config.isSkipped
            }
        };
    }

    public static mapToSchema(model: ChildCycleRef): ChildCycle {
        const childCycle = new ChildCycle();
        childCycle.cycleId = model.cycleId;
        childCycle.config = { ...model.config };
        return childCycle;
    }

}
