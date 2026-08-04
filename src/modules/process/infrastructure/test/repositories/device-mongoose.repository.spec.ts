import { Connection } from 'mongoose';
import { DeviceMongooseRepository } from '@process/infrastructure/repositories/device-mongoose.repository';
import { Device, DeviceSchema } from '@process/infrastructure/schemas/device.schema';
import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol } from '@process/domain/models/device.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';

function CreateDeviceModel(overrides: Partial<DeviceModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device.name = 'device';
    device.type = DeviceType.MASTER;
    device.description = 'description';
    const config = new MasterConfigModel();
    config.protocol = MasterProtocol.TCP;
    config.ipAddress = '192.168.1.10';
    config.port = 502;
    device.config = config;
    return Object.assign(device, overrides);
}

describe('DeviceMongooseRepository (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: DeviceMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('devices').deleteMany({});
        const deviceModel = connection.model(Device.name, DeviceSchema);
        repository = new DeviceMongooseRepository(deviceModel as never);
    });

    describe('create', () => {
        it('should persist and return the mapped device', async () => {
            const created = await repository.create(CreateDeviceModel({ name: 'device-1' }));

            expect(created._id).toBeDefined();
            expect(created.name).toEqual('device-1');
        });

        it('should round-trip discoveryRegisters for a MASTER device', async () => {
            const config = new MasterConfigModel();
            config.protocol = MasterProtocol.TCP;
            config.ipAddress = '192.168.1.20';
            config.port = 502;
            config.discoveryRegisters = [0x1000, 0x4000];
            const created = await repository.create(CreateDeviceModel({ name: 'master-multi', config }));

            const found = await repository.findById(created._id);

            expect((found.config as MasterConfigModel).discoveryRegisters).toEqual([0x1000, 0x4000]);
        });
    });

    describe('update', () => {
        it('should update an existing device', async () => {
            const created = await repository.create(CreateDeviceModel());

            const updated = await repository.update(created._id, CreateDeviceModel({ name: 'renamed' }));

            expect(updated.name).toEqual('renamed');
        });

        it('should throw ElementNotFoundExeception when the device does not exist', async () => {
            await expect(repository.update('missing-id', CreateDeviceModel())).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('upsert', () => {
        it('should insert a new device when the id does not exist yet', async () => {
            const upserted = await repository.upsert('new-id', CreateDeviceModel({ name: 'upserted' }));

            expect(upserted._id).toEqual('new-id');
            expect(upserted.name).toEqual('upserted');
        });
    });

    describe('delete', () => {
        it('should soft-delete an existing device', async () => {
            const created = await repository.create(CreateDeviceModel());

            const result = await repository.delete(created._id);

            expect(result).toEqual(true);
            expect(await repository.findById(created._id)).toBeNull();
        });

        it('should throw ElementNotFoundExeception when the device does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('findById', () => {
        it('should return null when not found', async () => {
            expect(await repository.findById('missing-id')).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return only non-deleted devices', async () => {
            const kept = await repository.create(CreateDeviceModel({ name: 'kept' }));
            const deleted = await repository.create(CreateDeviceModel({ name: 'deleted' }));
            await repository.delete(deleted._id);

            const all = await repository.findAll();

            expect(all.map((d) => d._id)).toEqual([kept._id]);
        });
    });

    describe('findByType', () => {
        it('should return only devices of the given type, excluding soft-deleted ones', async () => {
            const master = await repository.create(CreateDeviceModel({ name: 'master', type: DeviceType.MASTER }));
            const keptSlave = await repository.create(CreateDeviceModel({ name: 'slave-kept', type: DeviceType.SLAVE }));
            const deletedSlave = await repository.create(CreateDeviceModel({ name: 'slave-deleted', type: DeviceType.SLAVE }));
            await repository.delete(deletedSlave._id);

            const slaves = await repository.findByType(DeviceType.SLAVE);

            expect(slaves.map((d) => d._id)).toEqual([keptSlave._id]);
            expect(slaves.map((d) => d._id)).not.toContain(master._id);
        });

        it('should return an empty array when no device of that type exists', async () => {
            const slaves = await repository.findByType(DeviceType.SLAVE);

            expect(slaves).toEqual([]);
        });
    });
});
