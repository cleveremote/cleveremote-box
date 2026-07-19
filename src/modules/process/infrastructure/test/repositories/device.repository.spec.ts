import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceMongooseRepository } from '@process/infrastructure/repositories/device-mongoose.repository';
import { DeviceModel } from '@process/domain/models/device.model';
import { SynchronizeDeviceModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('DeviceRepository', () => {
    let mongooseRepository: { create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock };
    let repository: DeviceRepository;

    beforeEach(() => {
        mongooseRepository = { create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn() };
        repository = new DeviceRepository(mongooseRepository as never as DeviceMongooseRepository);
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
    });

    describe('saveMany', () => {
        it('should delete models flagged for deletion and save the rest, then return findAll', async () => {
            const toDelete = Object.assign(new SynchronizeDeviceModel(), { _id: 'id-1', delete: true });
            const toSave = Object.assign(new SynchronizeDeviceModel(), { _id: undefined, delete: false });
            mongooseRepository.create.mockResolvedValue(toSave);
            mongooseRepository.findAll.mockResolvedValue(['final']);

            const result = await repository.saveMany([toDelete, toSave]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
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
});
