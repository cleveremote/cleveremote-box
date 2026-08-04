import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { SynchronizeSequenceModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('SequenceRepository', () => {
    let mongooseRepository: {
        create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock; findByCycleId: jest.Mock;
    };
    let repository: SequenceRepository;

    beforeEach(() => {
        mongooseRepository = {
            create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn(), findByCycleId: jest.fn()
        };
        repository = new SequenceRepository(mongooseRepository as never as SequenceMongooseRepository);
    });

    describe('save', () => {
        it('should create when the model has no _id', async () => {
            const model = new SequenceModel();
            mongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });

        it('should upsert when the model has a valid uuid _id', async () => {
            const model = Object.assign(new SequenceModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a' });
            mongooseRepository.upsert.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.upsert).toHaveBeenCalledWith(model._id, model);
            expect(result).toEqual(model);
        });

        it('should throw InvalidIdException when the _id is not a valid uuid', async () => {
            const model = Object.assign(new SequenceModel(), { _id: 'not-a-uuid' });

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
            const model = new SequenceModel();
            mongooseRepository.findById.mockResolvedValue(model);

            const result = await repository.get('id-1');

            expect(mongooseRepository.findById).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(model);
        });
    });

    describe('findByCycleId', () => {
        it('should delegate to mongooseRepository.findByCycleId', async () => {
            const sequences = [new SequenceModel()];
            mongooseRepository.findByCycleId.mockResolvedValue(sequences);

            const result = await repository.findByCycleId('cycle-1');

            expect(mongooseRepository.findByCycleId).toHaveBeenCalledWith('cycle-1');
            expect(result).toEqual(sequences);
        });
    });

    describe('deleteForCycle', () => {
        it('should delete every sequence belonging to the cycle', async () => {
            const sequences = [
                Object.assign(new SequenceModel(), { _id: 'sequence-1' }),
                Object.assign(new SequenceModel(), { _id: 'sequence-2' })
            ];
            mongooseRepository.findByCycleId.mockResolvedValue(sequences);

            await repository.deleteForCycle('cycle-1');

            expect(mongooseRepository.findByCycleId).toHaveBeenCalledWith('cycle-1');
            expect(mongooseRepository.delete).toHaveBeenCalledWith('sequence-1');
            expect(mongooseRepository.delete).toHaveBeenCalledWith('sequence-2');
        });
    });

    describe('replaceForCycle', () => {
        it('should delete flagged models and save the rest scoped to the cycle, then return findByCycleId', async () => {
            const toDelete = Object.assign(new SynchronizeSequenceModel(), { _id: 'id-1', delete: true });
            const toSave = Object.assign(new SynchronizeSequenceModel(), { _id: undefined, delete: false });
            mongooseRepository.create.mockResolvedValue(toSave);
            mongooseRepository.findByCycleId.mockResolvedValue(['final']);

            const result = await repository.replaceForCycle('cycle-1', [toDelete, toSave]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(mongooseRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cycleId: 'cycle-1' }));
            expect(result).toEqual(['final']);
        });
    });
});
