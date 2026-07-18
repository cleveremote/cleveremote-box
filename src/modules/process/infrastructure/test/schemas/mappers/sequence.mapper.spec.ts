import { SequenceMapper } from '@process/infrastructure/schemas/mappers/sequence.mapper';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { ConditionModel } from '@process/domain/models/condition.model';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { SequenceDocument } from '@process/infrastructure/schemas/sequence.schema';

function CreateCondition(): ConditionModel {
    return Object.assign(new ConditionModel(), { name: 'c', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5 });
}

describe('SequenceMapper', () => {
    it('should map a document to a model with its conditions when present', () => {
        const document = {
            _id: 'seq-1', name: 'seq', description: 'd', status: ExecutableStatus.STOPPED,
            securityConfig: { maxDuration: 30, conditions: [CreateCondition()], customStacks: [{ comRequestId: 'com-1' }] }
        } as unknown as SequenceDocument;

        const model = SequenceMapper.mapToModel(document);

        expect(model).toEqual(expect.objectContaining({ _id: 'seq-1', name: 'seq' }));
        expect(model.securityConfig.maxDuration).toEqual(30);
        expect(model.securityConfig.conditions).toHaveLength(1);
        expect(model.securityConfig.conditions[0]).toEqual(expect.objectContaining({ elementId: 'sensor-1' }));
        expect(model.securityConfig.customStacks).toEqual([{ comRequestId: 'com-1' }]);
    });

    it('should leave conditions and customStacks undefined when absent on the document', () => {
        const document = { _id: 'seq-1', securityConfig: undefined } as unknown as SequenceDocument;

        const model = SequenceMapper.mapToModel(document);

        expect(model.securityConfig.conditions).toBeUndefined();
        expect(model.securityConfig.customStacks).toBeUndefined();
    });

    it('should map a model to a schema input with its conditions', () => {
        const model = Object.assign(new SequenceModel(), {
            _id: 'seq-1', name: 'seq', description: 'd', status: ExecutableStatus.STOPPED,
            securityConfig: { maxDuration: 30, conditions: [CreateCondition()], customStacks: [{ comRequestId: 'com-1' }] }
        });

        const schema = SequenceMapper.mapToSchema(model);

        expect(schema).toEqual(expect.objectContaining({ name: 'seq' }));
        expect(schema.securityConfig.maxDuration).toEqual(30);
        expect(schema.securityConfig.conditions).toHaveLength(1);
    });
});
