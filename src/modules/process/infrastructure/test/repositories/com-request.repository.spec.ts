import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ComRequestkMongooseRepository } from '@process/infrastructure/repositories/com-request-mongoose.repository';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { SynchronizeComRequestModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('ComRequestRepository', () => {
    let mongooseRepository: {
        create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock;
        findByDeviceIdAndTypes: jest.Mock; findByDeviceId: jest.Mock;
    };
    let repository: ComRequestRepository;

    beforeEach(() => {
        mongooseRepository = {
            create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn(),
            findByDeviceIdAndTypes: jest.fn(), findByDeviceId: jest.fn()
        };
        repository = new ComRequestRepository(mongooseRepository as never as ComRequestkMongooseRepository);
    });

    describe('save', () => {
        it('should create when the model has no _id', async () => {
            const model = new ComRequestModel();
            mongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });

        it('should upsert when the model has a valid uuid _id', async () => {
            const model = Object.assign(new ComRequestModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a' });
            mongooseRepository.upsert.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.upsert).toHaveBeenCalledWith(model._id, model);
            expect(result).toEqual(model);
        });

        it('should throw InvalidIdException when the _id is not a valid uuid', async () => {
            const model = Object.assign(new ComRequestModel(), { _id: 'not-a-uuid' });

            await expect(repository.save(model)).rejects.toThrow(InvalidIdException);
            expect(mongooseRepository.upsert).not.toHaveBeenCalled();
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

    describe('saveMany / replaceAll', () => {
        it('should delete models flagged for deletion and save the rest, then return findAll', async () => {
            const toDelete = Object.assign(new SynchronizeComRequestModel(), { _id: 'id-1', delete: true });
            const toSave = Object.assign(new SynchronizeComRequestModel(), { _id: undefined, delete: false });
            mongooseRepository.create.mockResolvedValue(toSave);
            mongooseRepository.findAll.mockResolvedValue(['final']);

            const result = await repository.saveMany([toDelete, toSave]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(mongooseRepository.create).toHaveBeenCalled();
            expect(result).toEqual(['final']);
        });

        it('replaceAll should behave like saveMany', async () => {
            mongooseRepository.findAll.mockResolvedValue([]);

            const result = await repository.replaceAll([]);

            expect(mongooseRepository.findAll).toHaveBeenCalled();
            expect(result).toEqual([]);
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
            const model = new ComRequestModel();
            mongooseRepository.findById.mockResolvedValue(model);

            const result = await repository.get('id-1');

            expect(mongooseRepository.findById).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(model);
        });
    });

    describe('getComRequestsByDeviceIdAndTypes', () => {
        it('should delegate to mongooseRepository.findByDeviceIdAndTypes', async () => {
            const models = [new ComRequestModel()];
            mongooseRepository.findByDeviceIdAndTypes.mockResolvedValue(models);

            const result = await repository.getComRequestsByDeviceIdAndTypes('device-1', [ComRequestType.ANALOG_INPUT]);

            expect(mongooseRepository.findByDeviceIdAndTypes).toHaveBeenCalledWith('device-1', [ComRequestType.ANALOG_INPUT]);
            expect(result).toEqual(models);
        });
    });

    describe('replaceForDevice', () => {
        it('should soft-delete existing comrequests absent from the incoming models, and save the rest with deviceId forced', async () => {
            const staleId = 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a';
            const keptId = 'a1b2c3d4-1b2c-4d3e-9f4a-5b6c7d8e9f0a';
            const staleExisting = Object.assign(new ComRequestModel(), { _id: staleId, deviceId: 'device-1' });
            const keptExisting = Object.assign(new ComRequestModel(), { _id: keptId, deviceId: 'device-1' });
            mongooseRepository.findByDeviceId.mockResolvedValueOnce([staleExisting, keptExisting]).mockResolvedValueOnce(['final']);
            const incoming = Object.assign(new SynchronizeComRequestModel(), { _id: keptId, deviceId: 'other-device' });

            const result = await repository.replaceForDevice('device-1', [incoming]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith(staleId);
            expect(mongooseRepository.delete).not.toHaveBeenCalledWith(keptId);
            expect(mongooseRepository.upsert).toHaveBeenCalledWith(keptId, expect.objectContaining({ deviceId: 'device-1' }));
            expect(result).toEqual(['final']);
        });

        it('should soft-delete a model explicitly flagged delete instead of saving it', async () => {
            mongooseRepository.findByDeviceId.mockResolvedValue([]);
            const toDelete = Object.assign(new SynchronizeComRequestModel(), { _id: 'id-1', delete: true });

            await repository.replaceForDevice('device-1', [toDelete]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(mongooseRepository.upsert).not.toHaveBeenCalled();
        });
    });
});
