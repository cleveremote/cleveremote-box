import { ConditionEntity } from '@process/infrastructure/entities/condition.entity';
import { ConditionModel } from '@process/domain/models/condition.model';

function CreateCondition<T extends ConditionModel>(ctor: new () => T): T {
    return Object.assign(new ctor(), {
        name: 'condition', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
    });
}

describe('ConditionEntity', () => {
    it('should map an entity to a model with every field copied', () => {
        const model = ConditionEntity.mapToModel(CreateCondition(ConditionEntity));

        expect(model).toEqual(expect.objectContaining({
            name: 'condition', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
        }));
    });

    it('should map a model to an entity with every field copied', () => {
        const entity = ConditionEntity.mapToEntity(CreateCondition(ConditionModel));

        expect(entity).toEqual(expect.objectContaining({
            name: 'condition', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
        }));
    });
});
