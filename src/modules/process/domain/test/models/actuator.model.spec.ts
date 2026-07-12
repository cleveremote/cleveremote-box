import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ComActuatorConfigModel, ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';

describe('ActuatorModel', () => {
    it('should default deletedAt to null', () => {
        const actuator = new ActuatorModel();

        expect(actuator.deletedAt).toBeNull();
    });

    it('should hold RPI-specific config fields when type is RPI', () => {
        const actuator = new ActuatorModel();
        actuator.type = ActuatorType.RPI;
        actuator._id = '1';
        actuator.name = '16';
        actuator.config = new RpiActuatorConfigModel();
        actuator.config.rpiPin = 16;

        expect(actuator.type).toEqual(ActuatorType.RPI);
        expect(actuator.config.rpiPin).toEqual(16);
    });

    it('should hold COM-specific config fields when type is COM', () => {
        const actuator = new ActuatorModel();
        actuator.type = ActuatorType.COM;
        actuator._id = '2';
        actuator.name = '30';
        actuator.config = new ComActuatorConfigModel();
        actuator.config.deviceId = 'com-1';

        expect(actuator.type).toEqual(ActuatorType.COM);
        expect(actuator.config.deviceId).toEqual('com-1');
    });
});
