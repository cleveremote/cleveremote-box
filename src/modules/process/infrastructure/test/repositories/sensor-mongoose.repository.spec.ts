import { Connection } from 'mongoose';
import { SensorMongooseRepository } from '@process/infrastructure/repositories/sensor-mongoose.repository';
import { Sensor, SensorSchema } from '@process/infrastructure/schemas/sensor.schema';
import { SensorModel, ComSensorConfigModel } from '@process/domain/models/sensor.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';

function CreateSensorModel(overrides: Partial<SensorModel> = {}): SensorModel {
    const sensor = new SensorModel();
    sensor.name = 'sensor';
    sensor.description = 'description';
    sensor.type = SensorType.COM;
    const config = new ComSensorConfigModel();
    config.cronPattern = '* * * * *';
    config.comRequestId = 'com-request-1';
    sensor.config = config;
    return Object.assign(sensor, overrides);
}

describe('SensorMongooseRepository (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: SensorMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('sensors').deleteMany({});
        const sensorModel = connection.model(Sensor.name, SensorSchema);
        repository = new SensorMongooseRepository(sensorModel as never);
    });

    describe('create', () => {
        it('should persist and return the mapped sensor', async () => {
            const created = await repository.create(CreateSensorModel({ name: 'sensor-1' }));

            expect(created._id).toBeDefined();
            expect(created.name).toEqual('sensor-1');
            expect(created.type).toEqual(SensorType.COM);
        });
    });

    describe('update', () => {
        it('should update an existing sensor', async () => {
            const created = await repository.create(CreateSensorModel());

            const updated = await repository.update(created._id, CreateSensorModel({ name: 'renamed' }));

            expect(updated.name).toEqual('renamed');
        });

        it('should throw ElementNotFoundExeception when the sensor does not exist', async () => {
            await expect(repository.update('missing-id', CreateSensorModel())).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('upsert', () => {
        it('should insert a new sensor when the id does not exist yet', async () => {
            const upserted = await repository.upsert('new-id', CreateSensorModel({ name: 'upserted' }));

            expect(upserted._id).toEqual('new-id');
            expect(upserted.name).toEqual('upserted');
        });

        it('should update the sensor when the id already exists', async () => {
            const created = await repository.create(CreateSensorModel());

            const upserted = await repository.upsert(created._id, CreateSensorModel({ name: 'updated-via-upsert' }));

            expect(upserted.name).toEqual('updated-via-upsert');
        });
    });

    describe('delete', () => {
        it('should soft-delete an existing sensor', async () => {
            const created = await repository.create(CreateSensorModel());

            const result = await repository.delete(created._id);

            expect(result).toEqual(true);
            expect(await repository.findById(created._id)).toBeNull();
        });

        it('should throw ElementNotFoundExeception when the sensor does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('findById', () => {
        it('should return the sensor when found and not deleted', async () => {
            const created = await repository.create(CreateSensorModel());

            const found = await repository.findById(created._id);

            expect(found._id).toEqual(created._id);
        });

        it('should return null when not found', async () => {
            expect(await repository.findById('missing-id')).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return only non-deleted sensors', async () => {
            const kept = await repository.create(CreateSensorModel({ name: 'kept' }));
            const deleted = await repository.create(CreateSensorModel({ name: 'deleted' }));
            await repository.delete(deleted._id);

            const all = await repository.findAll();

            expect(all.map((s) => s._id)).toEqual([kept._id]);
        });
    });

    describe('findByParentId', () => {
        it('should return only non-deleted sensors matching the parentId', async () => {
            const parent = await repository.create(CreateSensorModel({ name: 'parent' }));
            const child = await repository.create(CreateSensorModel({ name: 'child', parentId: parent._id }));
            const otherParentChild = await repository.create(CreateSensorModel({ name: 'other-child', parentId: 'other-parent' }));

            const children = await repository.findByParentId(parent._id);

            expect(children.map((s) => s._id)).toEqual([child._id]);
            expect(children.map((s) => s._id)).not.toContain(otherParentChild._id);
        });
    });
});
