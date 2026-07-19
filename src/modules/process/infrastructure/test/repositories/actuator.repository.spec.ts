import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { SynchronizeActuatorModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('ActuatorRepository', () => {
    let mongooseRepository: {
        create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock; findByIds: jest.Mock;
    };
    let repository: ActuatorRepository;

    beforeEach(() => {
        mongooseRepository = {
            create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn(), findByIds: jest.fn()
        };
        repository = new ActuatorRepository(mongooseRepository as never as ActuatorMongooseRepository);
    });

    describe('save', () => {
        it('should create when the model has no _id', async () => {
            const model = new ActuatorModel();
            mongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });

        it('should upsert when the model has a valid uuid _id', async () => {
            const model = Object.assign(new ActuatorModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a' });
            mongooseRepository.upsert.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.upsert).toHaveBeenCalledWith(model._id, model);
            expect(result).toEqual(model);
        });

        it('should throw InvalidIdException when the _id is not a valid uuid', async () => {
            const model = Object.assign(new ActuatorModel(), { _id: 'not-a-uuid' });

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

    describe('findByIds', () => {
        it('should delegate to mongooseRepository.findByIds', async () => {
            const models = [new ActuatorModel()];
            mongooseRepository.findByIds.mockResolvedValue(models);

            const result = await repository.findByIds(['id-1', 'id-2']);

            expect(mongooseRepository.findByIds).toHaveBeenCalledWith(['id-1', 'id-2']);
            expect(result).toEqual(models);
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
            const model = new ActuatorModel();
            mongooseRepository.findById.mockResolvedValue(model);

            const result = await repository.get('id-1');

            expect(mongooseRepository.findById).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(model);
        });
    });

    describe('saveMany', () => {
        it('should delete models flagged for deletion and save the rest, then return findAll', async () => {
            const toDelete = Object.assign(new SynchronizeActuatorModel(), { _id: 'id-1', delete: true });
            const toSave = Object.assign(new SynchronizeActuatorModel(), { _id: undefined, delete: false });
            mongooseRepository.create.mockResolvedValue(toSave);
            mongooseRepository.findAll.mockResolvedValue(['final']);

            const result = await repository.saveMany([toDelete, toSave]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(mongooseRepository.create).toHaveBeenCalled();
            expect(result).toEqual(['final']);
        });
    });
});
