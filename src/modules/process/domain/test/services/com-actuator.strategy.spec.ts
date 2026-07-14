import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ComActuatorConfigModel, ActuatorModel } from '@process/domain/models/actuator.model';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ComActuatorStrategy } from '@process/domain/services/actuator-strategies/com-actuator.strategy';
import { buildOverrideParamsCases } from './build-override-params.spec-mock';

function CreateActuatorComModel(): ActuatorModel {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.COM;
    actuator.config = new ComActuatorConfigModel();
    actuator.config.deviceId = 'com-1';
    actuator.config.actions = [{ comRequestId: 'req-1', portNumber: 1 }];
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
        const comRequest = Object.assign(new ComRequestModel(), {
            _id: 'com-request-1',
            config: { address: 5, function: [], params: { value: 0 } }
        });
        comRequestRepository.get.mockResolvedValue(comRequest);

        await strategy.execute(actuator, 1);

        expect(comRequestRepository.get).toHaveBeenCalledWith('req-1');
        expect(modBusService.execute).toHaveBeenCalledWith(comRequest, expect.objectContaining({
            address: 1,
            params: expect.objectContaining({ value: 1 })
        }));
    });

    it('should throw NotImplementedError on read', () => {
        const actuator = CreateActuatorComModel();

        expect(() => strategy.read(actuator)).toThrow(NotImplementedError);
    });

    it('should resolve without doing anything on configure', async () => {
        const actuator = CreateActuatorComModel();

        await expect(strategy.configure(actuator)).resolves.toBeUndefined();
    });

    it('should fall back to the existing com request address/value when the action portNumber/action are falsy', async () => {
        const actuator = CreateActuatorComModel();
        (actuator.config as ComActuatorConfigModel).actions = [{ comRequestId: 'req-1', portNumber: 0 }];
        const comRequest = Object.assign(new ComRequestModel(), {
            _id: 'com-request-1',
            config: { address: 5, function: [], params: { value: 9 } }
        });
        comRequestRepository.get.mockResolvedValue(comRequest);

        await strategy.execute(actuator, 0);

        expect(modBusService.execute).toHaveBeenCalledWith(comRequest, expect.objectContaining({
            address: 5,
            params: expect.objectContaining({ value: 9 })
        }));
    });

    describe('buidOverrideParams (shared merge logic - see build-override-params.spec-mock.ts)', () => {
        it.each(buildOverrideParamsCases)('$name', ({ existing, override, expected }) => {
            const result = (strategy as unknown as { buidOverrideParams: (p: unknown, o: unknown) => unknown }).buidOverrideParams(existing, override);

            expect(result).toEqual(expected);
        });
    });
});
