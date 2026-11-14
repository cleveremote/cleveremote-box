import { ConditionMapper } from '@process/infrastructure/schemas/mappers/condition.mapper';
import { ConditionModel } from '@process/domain/models/condition.model';
import { Condition } from '@process/infrastructure/schemas/condition.schema';

function CreateCondition<T extends ConditionModel | Condition>(ctor: new () => T): T {
    return Object.assign(new ctor(), {
        elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
    });
}

describe('ConditionMapper', () => {
    it('should map a document to a model with every field copied', () => {
        const model = ConditionMapper.mapToModel(CreateCondition(Condition));

        expect(model).toEqual(expect.objectContaining({
            elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
        }));
    });

    it('should map a model to a schema input with every field copied', () => {
        const schema = ConditionMapper.mapToSchema(CreateCondition(ConditionModel));

        expect(schema).toEqual(expect.objectContaining({
            elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
        }));
    });
});

describe('ConditionMapper.mapListToModel', () => {
    it('should convert the legacy and/or symbolEnd into the connector of the next condition', () => {
        const legacy = [
            Object.assign(new Condition(), { elementId: 'a', elementType: 'SENSOR', operator: '>', value: 1, order: 1, symbolStart: '(', symbolEnd: 'and' }),
            Object.assign(new Condition(), { elementId: 'b', elementType: 'SENSOR', operator: '<', value: 2, order: 2, symbolEnd: ')' })
        ];

        const models = ConditionMapper.mapListToModel(legacy);

        expect(models[0]).toEqual(expect.objectContaining({ connector: undefined, symbolStart: '(', symbolEnd: '' }));
        expect(models[1]).toEqual(expect.objectContaining({ connector: 'and', symbolStart: '', symbolEnd: ')' }));
    });

    it('should keep the connector and expose parent infos with the new format', () => {
        const condition = Object.assign(new Condition(), {
            elementId: 'a', elementType: 'CYCLE', operator: '=', value: 'ON', order: 2,
            connector: 'or', symbolStart: '', symbolEnd: ')', parentId: 'trigger-1', parentType: 'TRIGGER'
        });

        expect(ConditionMapper.mapListToModel([condition])[0]).toEqual(expect.objectContaining({
            connector: 'or', symbolEnd: ')', parentId: 'trigger-1', parentType: 'TRIGGER'
        }));
    });

    it('should normalize legacy 0/1 status values to OFF/ON and "==" to "="', () => {
        const legacy = [
            Object.assign(new Condition(), { elementId: 'a', elementType: 'CYCLE', operator: '==', value: 1, order: 1 }),
            Object.assign(new Condition(), { elementId: 'b', elementType: 'SEQUENCE', operator: '==', value: '0', order: 2, connector: 'and' })
        ];

        const models = ConditionMapper.mapListToModel(legacy);

        expect(models[0]).toEqual(expect.objectContaining({ operator: '=', value: 'ON' }));
        expect(models[1]).toEqual(expect.objectContaining({ operator: '=', value: 'OFF' }));
    });

    it('should keep numeric values of SENSOR conditions untouched', () => {
        const condition = Object.assign(new Condition(), { elementId: 'a', elementType: 'SENSOR', operator: '>', value: 1, order: 1 });

        expect(ConditionMapper.mapListToModel([condition])[0].value).toEqual(1);
    });

    it('should reassign duplicate/missing orders and default a missing connector to "and"', () => {
        const legacy = [
            Object.assign(new Condition(), { elementId: 'a', elementType: 'SENSOR', operator: '>', value: 1, order: 0 }),
            Object.assign(new Condition(), { elementId: 'b', elementType: 'SENSOR', operator: '>', value: 1, order: 0 }),
            Object.assign(new Condition(), { elementId: 'c', elementType: 'SENSOR', operator: '>', value: 1 })
        ];

        const models = ConditionMapper.mapListToModel(legacy);

        expect(models.map((m) => m.order)).toEqual([0, 1, 2]);
        expect(models.map((m) => m.connector)).toEqual([undefined, 'and', 'and']);
    });
});
