import { ActuatorMapper } from '@process/infrastructure/schemas/mappers/actuator.mapper';
import { ComActuatorConfigModel, ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus, GPIODirection, GPIOEdge } from '@process/domain/interfaces/structure.interface';
import { ActuatorDocument } from '@process/infrastructure/schemas/actuator.schema';

describe('ActuatorMapper', () => {
    it('should map an RPI document to a model with the status/config copied', () => {
        const document = {
            _id: 'actuator-1', type: ActuatorType.RPI, status: ModuleStatus.ON, name: '16',
            config: { rpiPin: 16, direction: GPIODirection.OUT, edge: GPIOEdge.BOTH, activeLow: true, reconfigureDirection: false, debounceTimeout: 10 }
        } as unknown as ActuatorDocument;

        const model = ActuatorMapper.mapToModel(document);

        expect(model._id).toEqual('actuator-1');
        expect(model.type).toEqual(ActuatorType.RPI);
        expect(model.status).toEqual(ModuleStatus.ON);
        expect(model.name).toEqual('16');
        expect(model.config).toEqual(expect.objectContaining({
            rpiPin: 16, direction: GPIODirection.OUT, edge: GPIOEdge.BOTH, activeLow: true, reconfigureDirection: false, debounceTimeout: 10
        }));
    });

    it('should map an RPI model to a schema input with the status/config copied', () => {
        const model = Object.assign(new ActuatorModel(), { _id: 'actuator-1', type: ActuatorType.RPI, status: ModuleStatus.OFF, name: '20' });
        model.config = Object.assign(new RpiActuatorConfigModel(), {
            rpiPin: 20, direction: GPIODirection.IN, edge: GPIOEdge.RISING, activeLow: false, reconfigureDirection: true, debounceTimeout: 5
        });

        const schema = ActuatorMapper.mapToSchema(model);

        expect(schema.type).toEqual(ActuatorType.RPI);
        expect(schema.status).toEqual(ModuleStatus.OFF);
        expect(schema.name).toEqual('20');
        expect(schema.config).toEqual({
            rpiPin: 20, direction: GPIODirection.IN, edge: GPIOEdge.RISING, activeLow: false, reconfigureDirection: true, debounceTimeout: 5
        });
    });

    it('should map a COM document to a model with the config copied', () => {
        const document = {
            _id: 'actuator-2', type: ActuatorType.COM, status: ModuleStatus.ON, name: '2',
            config: { deviceId: 'com-1', actions: [] }
        } as unknown as ActuatorDocument;

        const model = ActuatorMapper.mapToModel(document);

        expect(model._id).toEqual('actuator-2');
        expect(model.type).toEqual(ActuatorType.COM);
        expect(model.status).toEqual(ModuleStatus.ON);
        expect(model.name).toEqual('2');
        expect((model.config as ComActuatorConfigModel).deviceId).toEqual('com-1');
    });

    it('should map a COM model to a schema input with the config copied', () => {
        const model = Object.assign(new ActuatorModel(), { _id: 'actuator-2', type: ActuatorType.COM, status: ModuleStatus.OFF, name: '3' });
        model.config = new ComActuatorConfigModel();
        model.config.deviceId = 'com-2';
        model.config.actions = [];

        const schema = ActuatorMapper.mapToSchema(model);

        expect(schema.type).toEqual(ActuatorType.COM);
        expect(schema.status).toEqual(ModuleStatus.OFF);
        expect(schema.name).toEqual('3');
        expect((schema.config as ComActuatorConfigModel).deviceId).toEqual('com-2');
    });
});
