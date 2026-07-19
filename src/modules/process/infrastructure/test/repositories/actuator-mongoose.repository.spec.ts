import { Connection } from 'mongoose';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';
import { CreateActuatorMongooseModels, CreateActuatorRpiModel, CreateActuatorComModel } from '@process/domain/test/services/actuator.spec-mock';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('ActuatorMongooseRepository (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: ActuatorMongooseRepository;
    let logger: ReturnType<typeof CreateLoggerMock>;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('actuators').deleteMany({});
        await connection.collection('relay_rpis').deleteMany({});
        await connection.collection('relay_coms').deleteMany({});
        await connection.collection('valves').deleteMany({});
        const { actuatorModel, actuatorRpiModel, actuatorComModel, actuatorCtrlModel } = connection.models.Actuator
            ? {
                actuatorModel: connection.models.Actuator,
                actuatorRpiModel: connection.models.ActuatorRpi,
                actuatorComModel: connection.models.ActuatorCom,
                actuatorCtrlModel: connection.models.ActuatorCtrl
            }
            : CreateActuatorMongooseModels(connection);
        logger = CreateLoggerMock();
        repository = new ActuatorMongooseRepository(
            actuatorModel as never, actuatorRpiModel as never, actuatorComModel as never, actuatorCtrlModel as never,
            connection, logger as never
        );
    });

    describe('create / upsert per discriminator type', () => {
        it('should create a RPI actuator through the RPI discriminator model', async () => {
            const created = await repository.create(CreateActuatorRpiModel());

            expect(created.type).toEqual(ActuatorType.RPI);
        });

        it('should upsert a COM actuator through the COM discriminator model', async () => {
            const upserted = await repository.upsert('new-id', CreateActuatorComModel());

            expect(upserted._id).toEqual('new-id');
            expect(upserted.type).toEqual(ActuatorType.COM);
        });
    });

    describe('delete', () => {
        it('should soft-delete an existing actuator', async () => {
            const created = await repository.create(CreateActuatorRpiModel());

            const result = await repository.delete(created._id);

            expect(result).toEqual(true);
            expect(await repository.findById(created._id)).toBeNull();
        });

        it('should throw ElementNotFoundExeception when the actuator does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('findById', () => {
        it('should return null when not found', async () => {
            expect(await repository.findById('missing-id')).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return only non-deleted actuators', async () => {
            const kept = await repository.create(CreateActuatorRpiModel(undefined, 16));
            const deleted = await repository.create(CreateActuatorRpiModel(undefined, 20));
            await repository.delete(deleted._id);

            const all = await repository.findAll();

            expect(all.map((a) => a._id)).toEqual([kept._id]);
        });
    });

    describe('findByIds', () => {
        it('should return an empty array when given no ids', async () => {
            expect(await repository.findByIds([])).toEqual([]);
            expect(await repository.findByIds(undefined as never)).toEqual([]);
        });

        it('should return only non-deleted actuators matching the given ids', async () => {
            const one = await repository.create(CreateActuatorRpiModel(undefined, 16));
            const two = await repository.create(CreateActuatorRpiModel(undefined, 20));
            await repository.create(CreateActuatorRpiModel(undefined, 21));

            const result = await repository.findByIds([one._id, two._id, 'missing-id']);

            expect(result.map((a) => a._id).sort()).toEqual([one._id, two._id].sort());
        });
    });

    describe('migrateLegacyCollections', () => {
        it('should do nothing and not log when no legacy documents exist', async () => {
            await repository.migrateLegacyCollections();

            expect(await repository.findAll()).toEqual([]);
            expect(logger.log).not.toHaveBeenCalled();
        });

        it('should migrate legacy relay_rpis/relay_coms/valves documents into the actuators collection', async () => {
            await connection.collection('relay_rpis').insertOne({ _id: 'rpi-1', name: '16', status: ModuleStatus.OFF, config: { rpiPin: 16 } } as never);
            await connection.collection('relay_coms').insertOne({ _id: 'com-1', name: '30', status: ModuleStatus.OFF, config: { deviceId: 'device-1' } } as never);
            await connection.collection('valves').insertOne({ _id: 'valve-1', name: 'valve', type: 'PROPORTIONAL', config: { deviceId: 'device-1' } } as never);

            await repository.migrateLegacyCollections();

            const all = await repository.findAll();
            expect(all.map((a) => a._id).sort()).toEqual(['com-1', 'rpi-1', 'valve-1']);
            const migratedValve = all.find((a) => a._id === 'valve-1');
            expect(migratedValve.type).toEqual(ActuatorType.CTRL);
            expect(migratedValve.status).toEqual(ModuleStatus.OFF);
            expect(logger.log).toHaveBeenCalledWith(
                { rpiCount: 1, comCount: 1, valveCount: 1 },
                'migrated legacy relay_rpis/relay_coms/valves documents into the actuators collection'
            );
        });

        it('should be idempotent: a second run does not duplicate or override already-migrated documents', async () => {
            await connection.collection('relay_rpis').insertOne({ _id: 'rpi-1', name: '16', status: ModuleStatus.OFF, config: { rpiPin: 16 } } as never);

            await repository.migrateLegacyCollections();
            await repository.migrateLegacyCollections();

            const all = await repository.findAll();
            expect(all.filter((a) => a._id === 'rpi-1')).toHaveLength(1);
        });
    });
});
