import { ComRequestEntity } from '@process/infrastructure/entities/com-request.entity';
import { ComRequestModel } from '@process/domain/models/com-request.model';

describe('ModbusTaskConfigEntity', () => {
    it('should map an entity to a model with every field copied', () => {
        const entity = Object.assign(new ComRequestEntity(), {
            _id: 'task-1', deviceId: 'conn-1', name: 'task',
            config: { function: 'readHoldingRegisters', address: 100, params: { length: 2, scale: 0.1, unit: '°C' } }
        });

        const model = ComRequestEntity.mapToModel(entity);

        expect(model).toEqual(expect.objectContaining({
            _id: 'task-1', deviceId: 'conn-1', name: 'task',
            config: { function: 'readHoldingRegisters', address: 100, params: { length: 2, scale: 0.1, unit: '°C' } }
        }));
    });

    it('should map a model to an entity with every field copied', () => {
        const model = Object.assign(new ComRequestModel(), {
            _id: 'task-1', deviceId: 'conn-1', name: 'task',
            config: { function: 'writeRegister', address: 50, params: { length: 1, scale: 1, unit: '' } }
        });

        const entity = ComRequestEntity.mapToEntity(model);

        expect(entity).toEqual(expect.objectContaining({
            _id: 'task-1', deviceId: 'conn-1',
            config: expect.objectContaining({ function: 'writeRegister', address: 50 })
        }));
    });
});
