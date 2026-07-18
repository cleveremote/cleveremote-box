import { ConditionMapper } from '@process/infrastructure/schemas/mappers/condition.mapper';
import { ConditionModel } from '@process/domain/models/condition.model';
import { Condition } from '@process/infrastructure/schemas/condition.schema';

function CreateCondition<T extends ConditionModel | Condition>(ctor: new () => T): T {
    return Object.assign(new ctor(), {
        name: 'condition', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
    });
}

describe('ConditionMapper', () => {
    it('should map a document to a model with every field copied', () => {
        const model = ConditionMapper.mapToModel(CreateCondition(Condition));

        expect(model).toEqual(expect.objectContaining({
            name: 'condition', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
        }));
    });

    it('should map a model to a schema input with every field copied', () => {
        const schema = ConditionMapper.mapToSchema(CreateCondition(ConditionModel));

        expect(schema).toEqual(expect.objectContaining({
            name: 'condition', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
        }));
    });
});
