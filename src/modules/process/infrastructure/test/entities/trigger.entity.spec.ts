import { TriggerEntity } from '@process/infrastructure/entities/trigger.entity';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ConditionModel } from '@process/domain/models/condition.model';
import { ExecutableAction } from '@process/domain/interfaces/executable.interface';
import { SunState } from '@process/domain/interfaces/schedule.interface';

function CreateCondition(): ConditionModel {
    return Object.assign(new ConditionModel(), {
        name: 'c', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
    });
}

describe('TriggerEntity', () => {
    it('should map an entity to a model, including nested trigger config and mapped conditions', () => {
        const entity = Object.assign(new TriggerEntity(), {
            id: 'trigger-1', action: ExecutableAction.ON, cycleId: 'cycle-1', name: 'trigger', description: 'd',
            trigger: { timeAfter: 30, sunBehavior: { sunState: SunState.SUNRISE, time: 10 } },
            conditions: [CreateCondition()], isPaused: false, shouldConfirmation: true, delay: 60,
            lastTriggeredAt: new Date('2026-01-01')
        });

        const model = TriggerEntity.mapToModel(entity);

        expect(model).toEqual(expect.objectContaining({
            id: 'trigger-1', action: ExecutableAction.ON, cycleId: 'cycle-1', isPaused: false, shouldConfirmation: true, delay: 60
        }));
        expect(model.trigger).toEqual({ timeAfter: 30, sunBehavior: { sunState: SunState.SUNRISE, time: 10 } });
        expect(model.conditions).toHaveLength(1);
        expect(model.conditions[0]).toEqual(expect.objectContaining({ elementId: 'sensor-1' }));
    });

    it('should map a model to an entity, including nested trigger config and mapped conditions', () => {
        const model = Object.assign(new TriggerModel(), {
            id: 'trigger-1', action: ExecutableAction.OFF, cycleId: 'cycle-1', name: 'trigger', description: 'd',
            trigger: { timeAfter: 0 }, conditions: [CreateCondition()], isPaused: true, shouldConfirmation: false, delay: 0,
            lastTriggeredAt: null
        });

        const entity = TriggerEntity.mapToEntity(model);

        expect(entity).toEqual(expect.objectContaining({ id: 'trigger-1', action: ExecutableAction.OFF, isPaused: true }));
        expect(entity.trigger).toEqual({ timeAfter: 0, sunBehavior: undefined });
        expect(entity.conditions).toHaveLength(1);
        expect(entity.conditions[0]).toEqual(expect.objectContaining({ elementId: 'sensor-1' }));
    });
});
