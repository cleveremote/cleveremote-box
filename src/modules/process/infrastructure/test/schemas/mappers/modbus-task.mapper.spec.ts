import { ModbusTaskMapper } from '@process/infrastructure/schemas/mappers/modbus-task.mapper';
import { ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestDocument } from '@process/infrastructure/schemas/comrequest.schema';

describe('ModbusTaskMapper', () => {
    it('should map a document to a model with every field copied', () => {
        const document = {
            _id: 'task-1', deviceId: 'conn-1', name: 'task',
            config: { function: [ModbusFunctionName.READ_HOLDING_REGISTERS], address: 100, params: { length: 2, scale: 0.1, unit: '°C' } }
        } as unknown as ComRequestDocument;

        const model = ModbusTaskMapper.mapToModel(document);

        expect(model).toEqual(expect.objectContaining({
            _id: 'task-1', deviceId: 'conn-1', name: 'task',
            config: {
                function: [ModbusFunctionName.READ_HOLDING_REGISTERS], address: 100, disabled: undefined, done: false,
                params: { length: 2, scale: 0.1, unit: '°C' }
            }
        }));
    });

    it('should map a model to a schema input with every field copied', () => {
        const model = Object.assign(new ComRequestModel(), {
            _id: 'task-1', deviceId: 'conn-1', name: 'task',
            config: { function: [ModbusFunctionName.WRITE_SINGLE_REGISTER], address: 50, params: { length: 1, scale: 1, unit: '' } }
        });

        const schema = ModbusTaskMapper.mapToSchema(model);

        expect(schema).toEqual(expect.objectContaining({
            deviceId: 'conn-1',
            config: expect.objectContaining({ address: 50, function: [ModbusFunctionName.WRITE_SINGLE_REGISTER] })
        }));
    });

    it('should carry an array value through both mapping directions', () => {
        const document = {
            _id: 'task-1', deviceId: 'conn-1', name: 'task',
            config: { function: [ModbusFunctionName.WRITE_MULTIPLE_REGISTERS], address: 50, params: { value: [1, 2, 3] } }
        } as unknown as ComRequestDocument;

        const model = ModbusTaskMapper.mapToModel(document);
        expect(model.config.params).toEqual(expect.objectContaining({ value: [1, 2, 3] }));

        const schema = ModbusTaskMapper.mapToSchema(model);
        expect(schema.config.params).toEqual(expect.objectContaining({ value: [1, 2, 3] }));
    });
});
