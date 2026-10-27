import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceMongooseRepository } from '@process/infrastructure/repositories/device-mongoose.repository';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { SynchronizeDeviceModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('DeviceRepository', () => {
    let mongooseRepository: { create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock; findByType: jest.Mock; findSlavesByMasterId: jest.Mock };
    let modbusService: { resetSlaveAddress: jest.Mock };
    let actuatorRepository: { deleteForDevice: jest.Mock };
    let sensorRepository: { deleteForDevice: jest.Mock };
    let repository: DeviceRepository;

    beforeEach(() => {
        mongooseRepository = { create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn(), findByType: jest.fn(), findSlavesByMasterId: jest.fn().mockResolvedValue([]) };
        modbusService = { resetSlaveAddress: jest.fn() };
        actuatorRepository = { deleteForDevice: jest.fn() };
        sensorRepository = { deleteForDevice: jest.fn() };
        repository = new DeviceRepository(
            mongooseRepository as never as DeviceMongooseRepository,
            actuatorRepository as never as ActuatorRepository,
            sensorRepository as never as SensorRepository,
            modbusService as never,
            { warn: jest.fn(), error: jest.fn() } as never
        );
    });

    describe('save', () => {
        it('should create when the model has no _id', async () => {
            const model = new DeviceModel();
            mongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });

        it('should upsert when the model has a valid uuid _id', async () => {
            const model = Object.assign(new DeviceModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a' });
            mongooseRepository.upsert.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.upsert).toHaveBeenCalledWith(model._id, model);
            expect(result).toEqual(model);
        });

        it('should keep the slave model and applied init commands when not given (client synchronization)', async () => {
            const _id = 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a';
            mongooseRepository.findById.mockResolvedValue({ _id, type: DeviceType.SLAVE, config: { slaveId: 1, modelId: 'model-1', initDoneCommandIds: ['a'] } });
            const model = Object.assign(new DeviceModel(), { _id, type: DeviceType.SLAVE, config: { slaveId: 2 } });

            await repository.save(model);

            expect(mongooseRepository.upsert).toHaveBeenCalledWith(_id, expect.objectContaining({
                config: { slaveId: 2, modelId: 'model-1', initDoneCommandIds: ['a'] }
            }));
        });

        it('should save the given slave model and applied init commands as is', async () => {
            const _id = 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a';
            const model = Object.assign(new DeviceModel(), { _id, type: DeviceType.SLAVE, config: { slaveId: 2, modelId: 'model-2', initDoneCommandIds: [] } });

            await repository.save(model);

            expect(mongooseRepository.findById).not.toHaveBeenCalled();
            expect(mongooseRepository.upsert).toHaveBeenCalledWith(_id, model);
        });

        it('should throw InvalidIdException when the _id is not a valid uuid', async () => {
            const model = Object.assign(new DeviceModel(), { _id: 'not-a-uuid' });

            await expect(repository.save(model)).rejects.toThrow(InvalidIdException);
        });
    });

    describe('delete', () => {
        it('should delegate to mongooseRepository.delete', async () => {
            mongooseRepository.delete.mockResolvedValue(true);

            const result = await repository.delete('id-1');

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(true);
        });

        it('should reset a slave address before deleting it', async () => {
            const master = { _id: 'master', type: DeviceType.MASTER };
            const slave = { _id: 'slave-1', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 62 } };
            mongooseRepository.findById.mockImplementation(async (id: string) => (id === 'master' ? master : slave));
            mongooseRepository.delete.mockResolvedValue(true);

            await repository.delete('slave-1');

            expect(modbusService.resetSlaveAddress).toHaveBeenCalledWith(slave, master);
            expect(modbusService.resetSlaveAddress.mock.invocationCallOrder[0])
                .toBeLessThan(mongooseRepository.delete.mock.invocationCallOrder[0]);
        });

        it('should not delete the slave when the address reset fails', async () => {
            const slave = { _id: 'slave-1', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 62 } };
            mongooseRepository.findById.mockImplementation(async (id: string) => (id === 'master' ? { _id: 'master' } : slave));
            modbusService.resetSlaveAddress.mockRejectedValue(new Error('timeout'));

            await expect(repository.delete('slave-1')).rejects.toThrow('timeout');
            expect(mongooseRepository.delete).not.toHaveBeenCalled();
            expect(actuatorRepository.deleteForDevice).not.toHaveBeenCalled();
        });

        it('should not delete the slave when its master is not found', async () => {
            const slave = { _id: 'slave-1', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 62 } };
            mongooseRepository.findById.mockImplementation(async (id: string) => (id === 'master' ? null : slave));

            await expect(repository.delete('slave-1')).rejects.toThrow();
            expect(mongooseRepository.delete).not.toHaveBeenCalled();
        });

        it('should delete nothing when a slave reset fails during a master cascade', async () => {
            const master = { _id: 'master', type: DeviceType.MASTER };
            const slaves = [
                { _id: 'slave-1', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 62 } },
                { _id: 'slave-2', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 63 } }
            ];
            mongooseRepository.findById.mockResolvedValue(master);
            mongooseRepository.findSlavesByMasterId.mockImplementation(async (id: string) => (id === 'master' ? slaves : []));
            modbusService.resetSlaveAddress.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('timeout'));

            await expect(repository.delete('master')).rejects.toThrow('timeout');
            expect(mongooseRepository.delete).not.toHaveBeenCalled();
        });

        it('should cascade delete the slaves of a master device', async () => {
            mongooseRepository.delete.mockResolvedValue(true);
            const master = { _id: 'master', type: DeviceType.MASTER };
            const slave = { _id: 'slave-1', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 62 } };
            mongooseRepository.findById.mockResolvedValue(master);
            mongooseRepository.findSlavesByMasterId.mockImplementation(async (id: string) => (id === 'master' ? [slave] : []));

            await repository.delete('master');

            expect(modbusService.resetSlaveAddress).toHaveBeenCalledWith(slave, master);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('slave-1');
            expect(actuatorRepository.deleteForDevice).toHaveBeenCalledWith('slave-1');
            expect(mongooseRepository.delete).toHaveBeenCalledWith('master');
        });

        it('should cascade delete the actuators and device commands linked to the device', async () => {
            mongooseRepository.delete.mockResolvedValue(true);

            await repository.delete('id-1');

            expect(actuatorRepository.deleteForDevice).toHaveBeenCalledWith('id-1');
        });

        it('should cascade delete the actuators of a DIGITAL_IO_8CH slave', async () => {
            mongooseRepository.delete.mockResolvedValue(true);
            const master = { _id: 'master', type: DeviceType.MASTER };
            const slave = { _id: 'slave-io', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 61, kind: DeviceKind.DIGITAL_IO_8_CH } };
            mongooseRepository.findById.mockImplementation(async (id: string) => (id === 'master' ? master : slave));

            await repository.delete('slave-io');

            expect(actuatorRepository.deleteForDevice).toHaveBeenCalledWith('slave-io');
            expect(sensorRepository.deleteForDevice).not.toHaveBeenCalled();
            expect(mongooseRepository.delete).toHaveBeenCalledWith('slave-io');
        });

        it('should cascade delete the sensors of a FLOWMETER_V1 slave', async () => {
            mongooseRepository.delete.mockResolvedValue(true);
            const master = { _id: 'master', type: DeviceType.MASTER };
            const slave = { _id: 'slave-flow', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 11, kind: DeviceKind.FLOWMETER_V1 } };
            mongooseRepository.findById.mockImplementation(async (id: string) => (id === 'master' ? master : slave));

            await repository.delete('slave-flow');

            expect(sensorRepository.deleteForDevice).toHaveBeenCalledWith('slave-flow');
            expect(actuatorRepository.deleteForDevice).not.toHaveBeenCalled();
            expect(mongooseRepository.delete).toHaveBeenCalledWith('slave-flow');
        });

        it('should apply the cascade of each slave kind when deleting a master', async () => {
            mongooseRepository.delete.mockResolvedValue(true);
            const master = { _id: 'master', type: DeviceType.MASTER };
            const io = { _id: 'slave-io', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 61, kind: DeviceKind.DIGITAL_IO_8_CH } };
            const flow = { _id: 'slave-flow', type: DeviceType.SLAVE, config: { masterDeviceId: 'master', slaveId: 11, kind: DeviceKind.FLOWMETER_V1 } };
            mongooseRepository.findById.mockResolvedValue(master);
            mongooseRepository.findSlavesByMasterId.mockImplementation(async (id: string) => (id === 'master' ? [io, flow] : []));

            await repository.delete('master');

            expect(actuatorRepository.deleteForDevice).toHaveBeenCalledWith('slave-io');
            expect(sensorRepository.deleteForDevice).toHaveBeenCalledWith('slave-flow');
            expect(actuatorRepository.deleteForDevice).not.toHaveBeenCalledWith('slave-flow');
            expect(sensorRepository.deleteForDevice).not.toHaveBeenCalledWith('slave-io');
            expect(actuatorRepository.deleteForDevice).toHaveBeenCalledWith('master');
        });
    });

    describe('saveMany', () => {
        it('should delete models flagged for deletion and save the rest, then return findAll', async () => {
            const toDelete = Object.assign(new SynchronizeDeviceModel(), { _id: 'id-1', delete: true });
            const toSave = Object.assign(new SynchronizeDeviceModel(), { _id: undefined, delete: false });
            mongooseRepository.create.mockResolvedValue(toSave);
            mongooseRepository.findAll.mockResolvedValue(['final']);

            const result = await repository.saveMany([toDelete, toSave]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(actuatorRepository.deleteForDevice).toHaveBeenCalledWith('id-1');
            expect(mongooseRepository.create).toHaveBeenCalled();
            expect(result).toEqual(['final']);
        });
    });

    describe('get', () => {
        it('should return findAll when no id is given', async () => {
            mongooseRepository.findAll.mockResolvedValue([]);

            const result = await repository.get();

            expect(mongooseRepository.findAll).toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        it('should return findById when an id is given', async () => {
            const model = new DeviceModel();
            mongooseRepository.findById.mockResolvedValue(model);

            const result = await repository.get('id-1');

            expect(mongooseRepository.findById).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(model);
        });
    });

    describe('getByType', () => {
        it('should delegate to mongooseRepository.findByType with the given type', async () => {
            const models = [new DeviceModel()];
            mongooseRepository.findByType.mockResolvedValue(models);

            const result = await repository.getByType(DeviceType.MASTER);

            expect(mongooseRepository.findByType).toHaveBeenCalledWith(DeviceType.MASTER);
            expect(result).toEqual(models);
        });
    });
});
