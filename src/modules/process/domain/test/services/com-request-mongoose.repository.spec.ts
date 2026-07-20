import { Connection, Document } from 'mongoose';
import { ComRequestkMongooseRepository } from '@process/infrastructure/repositories/com-request-mongoose.repository';
import { ComRequest, ComRequestSchema } from '@process/infrastructure/schemas/comrequest.schema';
import { ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('ComRequestkMongooseRepository.migrateMissingType (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let repository: ComRequestkMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('comrequests').deleteMany({});
        logger = CreateLoggerMock();
        const comRequestModel = connection.model(ComRequest.name, ComRequestSchema);
        repository = new ComRequestkMongooseRepository(comRequestModel as never, logger as never);
    });

    it('should backfill type from function on a legacy document missing it', async () => {
        await connection.collection('comrequests').insertOne({
            _id: 'req-1', connectionId: 'device-1', function: 'writeCoil', label: 'DO1', address: 0, deletedAt: null
        } as unknown as Document);

        await repository.migrateMissingType();

        const doc = await connection.collection('comrequests').findOne({ _id: 'req-1' as never });
        expect(doc.type).toEqual(['DIGITAL_OUTPUT']);
    });

    it('should not touch a document that already has a type', async () => {
        await connection.collection('comrequests').insertOne({
            _id: 'req-2', connectionId: 'device-1', function: 'writeCoil', label: 'DO1', address: 0, deletedAt: null, type: ['ANALOG_INPUT']
        } as unknown as Document);

        await repository.migrateMissingType();

        const doc = await connection.collection('comrequests').findOne({ _id: 'req-2' as never });
        expect(doc.type).toEqual(['ANALOG_INPUT']);
    });

    it('should leave a document with an unknown function untouched and log a warning', async () => {
        await connection.collection('comrequests').insertOne({
            _id: 'req-3', connectionId: 'device-1', function: 'unknownFn', label: 'X', address: 0, deletedAt: null
        } as unknown as Document);

        await repository.migrateMissingType();

        const doc = await connection.collection('comrequests').findOne({ _id: 'req-3' as never });
        expect(doc.type).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'req-3', function: 'unknownFn' }),
            expect.stringContaining('comrequest.type could not be inferred')
        );
    });

    it('should be idempotent: a second run does not change already-migrated documents', async () => {
        await connection.collection('comrequests').insertOne({
            _id: 'req-4', connectionId: 'device-1', function: 'readDiscreteInputs', label: 'DI1', address: 0, deletedAt: null
        } as unknown as Document);

        await repository.migrateMissingType();
        await repository.migrateMissingType();

        const doc = await connection.collection('comrequests').findOne({ _id: 'req-4' as never });
        expect(doc.type).toEqual(['DIGITAL_INPUT']);
    });
});

describe('ComRequestkMongooseRepository params.persistence round-trip (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: ComRequestkMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('comrequests').deleteMany({});
        const comRequestModel = connection.model(ComRequest.name, ComRequestSchema);
        repository = new ComRequestkMongooseRepository(comRequestModel as never, CreateLoggerMock() as never);
    });

    it('should persist params.persistence unchanged', async () => {
        const model = Object.assign(new ComRequestModel(), {
            deviceId: 'device-1',
            name: 'inverter param',
            type: [ComRequestType.INVERTER_WRITE],
            config: {
                function: [ModbusFunctionName.WRITE_SINGLE_REGISTER],
                address: 100,
                params: { persistence: { persist: true, address: 0x1000 } }
            }
        });

        const created = await repository.create(model);

        const doc = await connection.collection('comrequests').findOne({ _id: created._id as never });
        expect(doc.config.params.persistence).toEqual({ persist: true, address: 0x1000 });
    });

    it('should leave params.persistence undefined when not provided', async () => {
        const model = Object.assign(new ComRequestModel(), {
            deviceId: 'device-1',
            name: 'generic slave read',
            type: [ComRequestType.ANALOG_INPUT],
            config: {
                function: [ModbusFunctionName.READ_INPUT_REGISTERS],
                address: 10,
                params: { length: 2 }
            }
        });

        const created = await repository.create(model);

        const doc = await connection.collection('comrequests').findOne({ _id: created._id as never });
        expect(doc.config.params.persistence).toBeUndefined();
    });
});

describe('ComRequestkMongooseRepository.findByDeviceIdAndTypes (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: ComRequestkMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('comrequests').deleteMany({});
        const comRequestModel = connection.model(ComRequest.name, ComRequestSchema);
        repository = new ComRequestkMongooseRepository(comRequestModel as never, CreateLoggerMock() as never);
    });

    function CreateComRequestModel(overrides: Partial<ComRequestModel>): ComRequestModel {
        return Object.assign(new ComRequestModel(), {
            deviceId: 'device-1',
            name: 'req',
            type: [ComRequestType.ANALOG_INPUT],
            config: {
                function: [ModbusFunctionName.READ_INPUT_REGISTERS],
                address: 10,
                params: {}
            },
            ...overrides
        });
    }

    it('should return only the comrequests matching both deviceId and one of the given types', async () => {
        await repository.create(CreateComRequestModel({ deviceId: 'device-1', type: [ComRequestType.ANALOG_INPUT] }));
        await repository.create(CreateComRequestModel({ deviceId: 'device-1', type: [ComRequestType.DIGITAL_OUTPUT] }));
        await repository.create(CreateComRequestModel({ deviceId: 'device-2', type: [ComRequestType.ANALOG_INPUT] }));

        const result = await repository.findByDeviceIdAndTypes('device-1', [ComRequestType.ANALOG_INPUT]);

        expect(result).toHaveLength(1);
        expect(result[0].deviceId).toEqual('device-1');
        expect(result[0].type).toEqual([ComRequestType.ANALOG_INPUT]);
    });

    it('should accept several types and match any of them (IN semantics)', async () => {
        await repository.create(CreateComRequestModel({ deviceId: 'device-1', type: [ComRequestType.ANALOG_INPUT] }));
        await repository.create(CreateComRequestModel({ deviceId: 'device-1', type: [ComRequestType.DIGITAL_OUTPUT] }));
        await repository.create(CreateComRequestModel({ deviceId: 'device-1', type: [ComRequestType.INVERTER_READ] }));

        const result = await repository.findByDeviceIdAndTypes('device-1', [ComRequestType.ANALOG_INPUT, ComRequestType.DIGITAL_OUTPUT]);

        expect(result).toHaveLength(2);
    });

    it('should exclude soft-deleted comrequests', async () => {
        const created = await repository.create(CreateComRequestModel({ deviceId: 'device-1', type: [ComRequestType.ANALOG_INPUT] }));
        await repository.delete(created._id);

        const result = await repository.findByDeviceIdAndTypes('device-1', [ComRequestType.ANALOG_INPUT]);

        expect(result).toHaveLength(0);
    });

    it('should return an empty array when no types are given', async () => {
        await repository.create(CreateComRequestModel({ deviceId: 'device-1', type: [ComRequestType.ANALOG_INPUT] }));

        const result = await repository.findByDeviceIdAndTypes('device-1', []);

        expect(result).toEqual([]);
    });
});

describe('ComRequestkMongooseRepository CRUD (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: ComRequestkMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('comrequests').deleteMany({});
        const comRequestModel = connection.model(ComRequest.name, ComRequestSchema);
        repository = new ComRequestkMongooseRepository(comRequestModel as never, CreateLoggerMock() as never);
    });

    function CreateComRequestModel(overrides: Partial<ComRequestModel>): ComRequestModel {
        return Object.assign(new ComRequestModel(), {
            deviceId: 'device-1',
            name: 'req',
            type: [ComRequestType.ANALOG_INPUT],
            config: {
                function: [ModbusFunctionName.READ_INPUT_REGISTERS],
                address: 10,
                params: {}
            },
            ...overrides
        });
    }

    describe('update', () => {
        it('should update an existing comrequest', async () => {
            const created = await repository.create(CreateComRequestModel({ name: 'original' }));

            const updated = await repository.update(created._id, CreateComRequestModel({ name: 'renamed' }));

            expect(updated.name).toEqual('renamed');
        });

        it('should throw ElementNotFoundExeception when the comrequest does not exist', async () => {
            await expect(repository.update('missing-id', CreateComRequestModel({}))).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('upsert', () => {
        it('should insert a new comrequest when the id does not exist yet', async () => {
            const upserted = await repository.upsert('new-id', CreateComRequestModel({ name: 'upserted' }));

            expect(upserted._id).toEqual('new-id');
            expect(upserted.name).toEqual('upserted');
        });
    });

    describe('findById', () => {
        it('should return the comrequest when found and not deleted', async () => {
            const created = await repository.create(CreateComRequestModel({}));

            expect((await repository.findById(created._id))._id).toEqual(created._id);
        });

        it('should return null when not found', async () => {
            expect(await repository.findById('missing-id')).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return only non-deleted comrequests', async () => {
            const kept = await repository.create(CreateComRequestModel({ name: 'kept' }));
            const deleted = await repository.create(CreateComRequestModel({ name: 'deleted' }));
            await repository.delete(deleted._id);

            const all = await repository.findAll();

            expect(all.map((t) => t._id)).toEqual([kept._id]);
        });
    });

    describe('delete', () => {
        it('should throw ElementNotFoundExeception when the comrequest does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('findByDeviceIdAndTypes', () => {
        it('should return an empty array when types is undefined', async () => {
            await repository.create(CreateComRequestModel({ deviceId: 'device-1' }));

            const result = await repository.findByDeviceIdAndTypes('device-1', undefined as never);

            expect(result).toEqual([]);
        });
    });

    describe('migrateMissingType (function stored as an array)', () => {
        it('should backfill type when the legacy document stores function as an array', async () => {
            await connection.collection('comrequests').insertOne({
                _id: 'req-array', connectionId: 'device-1', function: ['writeCoil'], label: 'DO1', address: 0, deletedAt: null
            } as never);

            await repository.migrateMissingType();

            const doc = await connection.collection('comrequests').findOne({ _id: 'req-array' as never });
            expect(doc.type).toEqual(['DIGITAL_OUTPUT']);
        });
    });
});
