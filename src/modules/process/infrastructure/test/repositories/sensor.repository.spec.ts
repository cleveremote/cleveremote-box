import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { SensorMongooseRepository } from '@process/infrastructure/repositories/sensor-mongoose.repository';
import { SensorModel } from '@process/domain/models/sensor.model';
import { SynchronizeSensorModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('SensorRepository', () => {
    let mongooseRepository: {
        create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock; findByParentId: jest.Mock;
    };
    let repository: SensorRepository;

    beforeEach(() => {
        mongooseRepository = {
            create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn(), findByParentId: jest.fn()
        };
        repository = new SensorRepository(mongooseRepository as never as SensorMongooseRepository);
    });

    describe('save', () => {
        it('should create when the model has no id', async () => {
            const model = new SensorModel();
            mongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });

        it('should upsert when the model has a valid uuid id', async () => {
            const model = Object.assign(new SensorModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a' });
            mongooseRepository.upsert.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.upsert).toHaveBeenCalledWith(model._id, model);
            expect(result).toEqual(model);
        });

        it('should throw InvalidIdException when the id is not a valid uuid', async () => {
            const model = Object.assign(new SensorModel(), { _id: 'not-a-uuid' });

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

    describe('get', () => {
        it('should return findAll when no id is given', async () => {
            mongooseRepository.findAll.mockResolvedValue([]);

            const result = await repository.get();

            expect(mongooseRepository.findAll).toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        it('should return findById when an id is given', async () => {
            const model = new SensorModel();
            mongooseRepository.findById.mockResolvedValue(model);

            const result = await repository.get('id-1');

            expect(mongooseRepository.findById).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(model);
        });
    });

    describe('getParent', () => {
        it('should return null when the sensor has no parentId', async () => {
            const sensor = Object.assign(new SensorModel(), { parentId: null });

            const result = await repository.getParent(sensor);

            expect(result).toBeNull();
            expect(mongooseRepository.findById).not.toHaveBeenCalled();
        });

        it('should return the parent sensor when parentId is set', async () => {
            const parent = new SensorModel();
            mongooseRepository.findById.mockResolvedValue(parent);
            const sensor = Object.assign(new SensorModel(), { parentId: 'parent-1' });

            const result = await repository.getParent(sensor);

            expect(mongooseRepository.findById).toHaveBeenCalledWith('parent-1');
            expect(result).toEqual(parent);
        });
    });

    describe('getChildren', () => {
        it('should delegate to mongooseRepository.findByParentId', async () => {
            const children = [new SensorModel()];
            mongooseRepository.findByParentId.mockResolvedValue(children);

            const result = await repository.getChildren('parent-1');

            expect(mongooseRepository.findByParentId).toHaveBeenCalledWith('parent-1');
            expect(result).toEqual(children);
        });
    });

    describe('replaceAll', () => {
        it('should delete models flagged for deletion and save the rest, then return findAll', async () => {
            const toDelete = Object.assign(new SynchronizeSensorModel(), { _id: 'id-1', delete: true });
            const toSave = Object.assign(new SynchronizeSensorModel(), { _id: undefined, delete: false });
            mongooseRepository.create.mockResolvedValue(toSave);
            mongooseRepository.findAll.mockResolvedValue(['final']);

            const result = await repository.replaceAll([toDelete, toSave]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(mongooseRepository.create).toHaveBeenCalled();
            expect(result).toEqual(['final']);
        });
    });
});
