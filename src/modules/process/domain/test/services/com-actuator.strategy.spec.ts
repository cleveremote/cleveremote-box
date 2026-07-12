import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ComActuatorAction, ComActuatorConfigModel, ActuatorModel, DigitalPortType } from '@process/domain/models/actuator.model';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ComActuatorStrategy } from '@process/domain/services/actuator-strategies/com-actuator.strategy';

function CreateActuatorComModel(): ActuatorModel {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.COM;
    actuator.config = new ComActuatorConfigModel();
    actuator.config.deviceId = 'com-1';
    actuator.config.actions = [{ comRequestId: 'req-1', action: ComActuatorAction.ON, digitalPort: 1, type: DigitalPortType.OUTPUT }];
    return actuator;
}

describe('ComActuatorStrategy', () => {
    let modBusService: { execute: jest.Mock };
    let comRequestRepository: { get: jest.Mock };
    let strategy: ComActuatorStrategy;

    beforeEach(() => {
        modBusService = { execute: jest.fn() };
        comRequestRepository = { get: jest.fn() };
        strategy = new ComActuatorStrategy(modBusService as never, comRequestRepository as never);
    });

    it('should have the COM type', () => {
        expect(strategy.type).toEqual(ActuatorType.COM);
    });

    it('should fetch the com request behind the first action and delegate execution to the modbus task service', async () => {
        const actuator = CreateActuatorComModel();
        const comRequest = Object.assign(new ComRequestModel(), { _id: 'com-request-1' });
        comRequestRepository.get.mockResolvedValue(comRequest);

        await strategy.execute(actuator, 1);

        expect(comRequestRepository.get).toHaveBeenCalledWith('req-1');
        expect(modBusService.execute).toHaveBeenCalledWith('com-request-1', { value: 1 });
    });

    it('should throw NotImplementedError on read', () => {
        const actuator = CreateActuatorComModel();

        expect(() => strategy.read(actuator)).toThrow(NotImplementedError);
    });
});
