import { SequenceEntity } from '@process/infrastructure/entities/sequence.entity';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { ConditionModel } from '@process/domain/models/condition.model';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';

function CreateCondition(): ConditionModel {
    return Object.assign(new ConditionModel(), { name: 'c', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5 });
}

describe('SequenceEntity', () => {
    it('should map an entity to a model with its conditions when present', () => {
        const entity = Object.assign(new SequenceEntity(), {
            _id: 'seq-1', name: 'seq', description: 'd', status: ExecutableStatus.STOPPED,
            securityConfig: { maxDuration: 30, conditions: [CreateCondition()], customStack: [{ taskId: 'task-1', param: null }] }
        });

        const model = SequenceEntity.mapToModel(entity);

        expect(model).toEqual(expect.objectContaining({ _id: 'seq-1', name: 'seq' }));
        expect(model.securityConfig.maxDuration).toEqual(30);
        expect(model.securityConfig.conditions).toHaveLength(1);
        expect(model.securityConfig.conditions[0]).toEqual(expect.objectContaining({ elementId: 'sensor-1' }));
    });

    it('should leave conditions and customStack undefined when absent on the entity', () => {
        const entity = Object.assign(new SequenceEntity(), { _id: 'seq-1', securityConfig: undefined });

        const model = SequenceEntity.mapToModel(entity);

        expect(model.securityConfig.conditions).toBeUndefined();
        expect(model.securityConfig.customStack).toBeUndefined();
    });

    it('should map a model to an entity with its conditions', () => {
        const model = Object.assign(new SequenceModel(), {
            _id: 'seq-1', name: 'seq', description: 'd', status: ExecutableStatus.STOPPED,
            securityConfig: { maxDuration: 30, conditions: [CreateCondition()], customStack: [{ taskId: 'task-1', param: null }] }
        });

        const entity = SequenceEntity.mapToEntity(model);

        expect(entity).toEqual(expect.objectContaining({ _id: 'seq-1', name: 'seq' }));
        expect(entity.securityConfig.maxDuration).toEqual(30);
        expect(entity.securityConfig.conditions).toHaveLength(1);
    });
});
