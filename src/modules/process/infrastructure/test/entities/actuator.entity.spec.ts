import { ActuatorEntity } from '@process/infrastructure/entities/actuator.entity';
import { ComActuatorConfigModel, ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus, GPIODirection, GPIOEdge } from '@process/domain/interfaces/structure.interface';

describe('ActuatorEntity', () => {
    it('should map an RPI entity to a model with the port/status/config copied', () => {
        const entity = Object.assign(new ActuatorEntity(), { _id: 'actuator-1', type: ActuatorType.RPI, status: ModuleStatus.ON, name: '16' });
        entity.config = Object.assign(new RpiActuatorConfigModel(), {
            rpiPin: 16, direction: GPIODirection.OUT, edge: GPIOEdge.BOTH, activeLow: true, reconfigureDirection: false, debounceTimeout: 10
        });

        const model = ActuatorEntity.mapToModel(entity);

        expect(model._id).toEqual('actuator-1');
        expect(model.type).toEqual(ActuatorType.RPI);
        expect(model.status).toEqual(ModuleStatus.ON);
        expect(model.name).toEqual('16');
        expect(model.config).toEqual(expect.objectContaining({
            rpiPin: 16, direction: GPIODirection.OUT, edge: GPIOEdge.BOTH, activeLow: true, reconfigureDirection: false, debounceTimeout: 10
        }));
    });

    it('should map an RPI model to an entity with the port/status/config copied', () => {
        const model = Object.assign(new ActuatorModel(), { _id: 'actuator-1', type: ActuatorType.RPI, status: ModuleStatus.OFF, name: '20' });
        model.config = Object.assign(new RpiActuatorConfigModel(), {
            rpiPin: 20, direction: GPIODirection.IN, edge: GPIOEdge.RISING, activeLow: false, reconfigureDirection: true, debounceTimeout: 5
        });

        const entity = ActuatorEntity.mapToEntity(model);

        expect(entity._id).toEqual('actuator-1');
        expect(entity.type).toEqual(ActuatorType.RPI);
        expect(entity.status).toEqual(ModuleStatus.OFF);
        expect(entity.name).toEqual('20');
        expect(entity.config).toEqual(expect.objectContaining({
            rpiPin: 20, direction: GPIODirection.IN, edge: GPIOEdge.RISING, activeLow: false, reconfigureDirection: true, debounceTimeout: 5
        }));
    });

    it('should map a COM entity to a model with the port/status/config copied', () => {
        const entity = Object.assign(new ActuatorEntity(), { _id: 'actuator-2', type: ActuatorType.COM, status: ModuleStatus.ON, name: '2' });
        entity.config = new ComActuatorConfigModel();
        entity.config.deviceId = 'com-1';

        const model = ActuatorEntity.mapToModel(entity);

        expect(model._id).toEqual('actuator-2');
        expect(model.type).toEqual(ActuatorType.COM);
        expect(model.status).toEqual(ModuleStatus.ON);
        expect(model.name).toEqual('2');
        expect((model.config as ComActuatorConfigModel).deviceId).toEqual('com-1');
    });

    it('should map a COM model to an entity with the port/status/config copied', () => {
        const model = Object.assign(new ActuatorModel(), { _id: 'actuator-2', type: ActuatorType.COM, status: ModuleStatus.OFF, name: '3' });
        model.config = new ComActuatorConfigModel();
        model.config.deviceId = 'com-2';

        const entity = ActuatorEntity.mapToEntity(model);

        expect(entity._id).toEqual('actuator-2');
        expect(entity.type).toEqual(ActuatorType.COM);
        expect(entity.status).toEqual(ModuleStatus.OFF);
        expect(entity.name).toEqual('3');
        expect((entity.config as ComActuatorConfigModel).deviceId).toEqual('com-2');
    });
});
