import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { ActuatorService } from '@process/domain/services/actuator.service';
import { RpiActuatorStrategy } from '@process/domain/services/actuator-strategies/rpi-actuator.strategy';
import { ComActuatorStrategy } from '@process/domain/services/actuator-strategies/com-actuator.strategy';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { GPIODirection, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { NotSwitchError } from '@process/domain/errors/not-switch.error';
import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { Gpio } from 'onoff';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateActuatorRpiModel, CreateActuatorComModel, CreateActuatorMongooseModels } from './actuator.spec-mock';

// RpiActuatorStrategy.configure() peut ouvrir un vrai pin GPIO quand `Gpio.accessible` est vrai (cas
// reel sur la box physique) : on mocke tout le module 'onoff' pour que les tests ne touchent
// jamais un GPIO reel, quelle que soit la machine qui les execute (CI ou box).
jest.mock('onoff', () => {
    class MockGpio {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        public static accessible = false;
        public writeSync = jest.fn();
        public unexport = jest.fn();
        public direction = jest.fn(() => 'out');
        public readSync = jest.fn(() => 0);

        public constructor() {
            throw new Error('GPIO not accessible in tests');
        }
    }
    return { Gpio: MockGpio };
});

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('ActuatorService', () => {

    // execute()/reset() delegue au bon ActuatorStrategy selon le type ; le comportement GPIO/COM
    // detaille est teste directement sur rpi-actuator.strategy.spec.ts / com-actuator.strategy.spec.ts.
    describe('execute / reset (strategy dispatch)', () => {
        let service: ActuatorService;
        let logger: ReturnType<typeof CreateLoggerMock>;
        let modBusService: { execute: jest.Mock };
        let comRequestRepository: { get: jest.Mock };

        beforeEach(() => {
            Gpio.accessible = false;
            logger = CreateLoggerMock();
            modBusService = { execute: jest.fn() };
            comRequestRepository = { get: jest.fn().mockResolvedValue(Object.assign(new ComRequestModel(), { _id: 'com-request-1' })) };
            const strategies = [new RpiActuatorStrategy(logger as never), new ComActuatorStrategy(modBusService as never, comRequestRepository as never)];
            service = new ActuatorService(logger as never, {} as never, strategies);
        });

        it('should write the pin and update the status when executing an OUT rpi actuator', async () => {
            const actuator = CreateActuatorRpiModel(GPIODirection.OUT);

            await service.execute(actuator, 1);
            expect(actuator.status).toEqual(ModuleStatus.ON);

            await service.execute(actuator, 0);
            expect(actuator.status).toEqual(ModuleStatus.OFF);
        });

        it('should throw NotSwitchError when executing a actuator configured as IN', async () => {
            const actuator = CreateActuatorRpiModel(GPIODirection.IN);

            await expect(service.execute(actuator, 1)).rejects.toThrow(NotSwitchError);
        });

        it('should delegate a COM actuator execution to the modbus task service', async () => {
            const actuator = CreateActuatorComModel();

            await service.execute(actuator, 1);

            expect(modBusService.execute).toHaveBeenCalledWith('com-request-1', { value: 1 });
        });

        it('should throw NotImplementedError for an unsupported actuator type', async () => {
            const actuator = { ...CreateActuatorRpiModel(), type: 'UNKNOWN' } as never;

            await expect(service.execute(actuator, 1)).rejects.toThrow(NotImplementedError);
        });

        it('should reset every actuator to OFF and swallow individual failures', async () => {
            const outActuator = CreateActuatorRpiModel(GPIODirection.OUT, 16);
            await service.execute(outActuator, 1);
            const inActuator = CreateActuatorRpiModel(GPIODirection.IN, 26);

            await service.reset([outActuator, inActuator]);

            expect(outActuator.status).toEqual(ModuleStatus.OFF);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ name: '26' }),
                'reset actuator error'
            );
        });
    });

    // resolve() est la seule methode qui touche la persistance : integration reelle contre un
    // serveur Mongo en memoire plutot que des repositories mockes.
    describe('resolve (integration mongodb-memory-server)', () => {
        let mongod: MongoMemoryServer;
        let connection: Connection;
        let actuatorRepository: ActuatorRepository;
        let service: ActuatorService;

        beforeAll(async () => {
            ({ mongod, connection } = await StartMongoMemory());

            const { actuatorModel, actuatorRpiModel, actuatorComModel, actuatorCtrlModel } = CreateActuatorMongooseModels(connection);

            actuatorRepository = new ActuatorRepository(new ActuatorMongooseRepository(
                actuatorModel as never, actuatorRpiModel as never, actuatorComModel as never, actuatorCtrlModel as never,
                connection, CreateLoggerMock() as never
            ));
            service = new ActuatorService(CreateLoggerMock() as never, actuatorRepository, [new RpiActuatorStrategy(CreateLoggerMock() as never), new ComActuatorStrategy({ execute: jest.fn() } as never, { get: jest.fn() } as never)]);
        }, 120000);

        afterAll(async () => {
            await StopMongoMemory(mongod, connection);
        });

        beforeEach(async () => {
            await connection.collection('actuators').deleteMany({});
        });

        it('should resolve rpi and com actuators by id into a single registry', async () => {
            const rpi = await actuatorRepository.save(CreateActuatorRpiModel());
            const com = await actuatorRepository.save(CreateActuatorComModel());

            const registry = await service.resolve([rpi._id, com._id, 'missing-id']);

            expect(registry.size).toEqual(2);
            expect(registry.get(rpi._id)?.type).toEqual(ActuatorType.RPI);
            expect(registry.get(com._id)?.type).toEqual(ActuatorType.COM);
        });

        it('should deduplicate repeated ids before querying', async () => {
            const rpi = await actuatorRepository.save(CreateActuatorRpiModel());

            const registry = await service.resolve([rpi._id, rpi._id, rpi._id]);

            expect(registry.size).toEqual(1);
        });

        it('should return an empty registry when given no ids', async () => {
            const registry = await service.resolve([]);

            expect(registry.size).toEqual(0);
        });
    });
});
