import { TriggerMapper } from '@process/infrastructure/schemas/mappers/trigger.mapper';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ConditionModel } from '@process/domain/models/condition.model';
import { ExecutableAction } from '@process/domain/interfaces/executable.interface';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { TriggerDocument } from '@process/infrastructure/schemas/trigger.schema';

function CreateCondition(): ConditionModel {
    return Object.assign(new ConditionModel(), {
        name: 'c', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
    });
}

describe('TriggerMapper', () => {
    it('should map a document to a model, including nested trigger config and mapped conditions', () => {
        const document = {
            _id: 'trigger-1', action: ExecutableAction.ON, cycleId: 'cycle-1', name: 'trigger', description: 'd',
            trigger: { timeAfter: 30, sunBehavior: { sunState: SunState.SUNRISE, time: 10 } },
            conditions: [CreateCondition()], isPaused: false, shouldConfirmation: true, delay: 60,
            lastTriggeredAt: new Date('2026-01-01')
        } as unknown as TriggerDocument;

        const model = TriggerMapper.mapToModel(document);

        expect(model).toEqual(expect.objectContaining({
            id: 'trigger-1', action: ExecutableAction.ON, cycleId: 'cycle-1', isPaused: false, shouldConfirmation: true, delay: 60
        }));
        expect(model.trigger).toEqual({ timeAfter: 30, sunBehavior: { sunState: SunState.SUNRISE, time: 10 } });
        expect(model.conditions).toHaveLength(1);
        expect(model.conditions[0]).toEqual(expect.objectContaining({ elementId: 'sensor-1' }));
    });

    it('should map a model to a schema input, including nested trigger config and mapped conditions', () => {
        const model = Object.assign(new TriggerModel(), {
            id: 'trigger-1', action: ExecutableAction.OFF, cycleId: 'cycle-1', name: 'trigger', description: 'd',
            trigger: { timeAfter: 0 }, conditions: [CreateCondition()], isPaused: true, shouldConfirmation: false, delay: 0,
            lastTriggeredAt: null
        });

        const schema = TriggerMapper.mapToSchema(model);

        expect(schema).toEqual(expect.objectContaining({ cycleId: 'cycle-1', action: ExecutableAction.OFF, isPaused: true }));
        expect(schema.trigger).toEqual({ timeAfter: 0, sunBehavior: undefined });
        expect(schema.conditions).toHaveLength(1);
        expect(schema.conditions[0]).toEqual(expect.objectContaining({ elementId: 'sensor-1' }));
    });
});
