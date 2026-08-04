import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { SynchronizeTriggerModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('TriggerRepository', () => {
    let mongooseRepository: {
        create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock; findByCycleId: jest.Mock;
    };
    let repository: TriggerRepository;

    beforeEach(() => {
        mongooseRepository = {
            create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn(), findByCycleId: jest.fn()
        };
        repository = new TriggerRepository(mongooseRepository as never as TriggerMongooseRepository);
    });

    describe('save', () => {
        it('should create when the model has no id', async () => {
            const model = new TriggerModel();
            mongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });

        it('should upsert when the model has a valid uuid id', async () => {
            const model = Object.assign(new TriggerModel(), { id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a' });
            mongooseRepository.upsert.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.upsert).toHaveBeenCalledWith(model.id, model);
            expect(result).toEqual(model);
        });

        it('should throw InvalidIdException when the id is not a valid uuid', async () => {
            const model = Object.assign(new TriggerModel(), { id: 'not-a-uuid' });

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

    describe('findByCycleId', () => {
        it('should delegate to mongooseRepository.findByCycleId', async () => {
            const triggers = [new TriggerModel()];
            mongooseRepository.findByCycleId.mockResolvedValue(triggers);

            const result = await repository.findByCycleId('cycle-1');

            expect(mongooseRepository.findByCycleId).toHaveBeenCalledWith('cycle-1');
            expect(result).toEqual(triggers);
        });
    });

    describe('deleteForCycle', () => {
        it('should delete every trigger belonging to the cycle', async () => {
            const triggers = [
                Object.assign(new TriggerModel(), { id: 'trigger-1' }),
                Object.assign(new TriggerModel(), { id: 'trigger-2' })
            ];
            mongooseRepository.findByCycleId.mockResolvedValue(triggers);

            await repository.deleteForCycle('cycle-1');

            expect(mongooseRepository.findByCycleId).toHaveBeenCalledWith('cycle-1');
            expect(mongooseRepository.delete).toHaveBeenCalledWith('trigger-1');
            expect(mongooseRepository.delete).toHaveBeenCalledWith('trigger-2');
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
            const model = new TriggerModel();
            mongooseRepository.findById.mockResolvedValue(model);

            const result = await repository.get('id-1');

            expect(mongooseRepository.findById).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(model);
        });
    });

    describe('replaceForCycle', () => {
        it('should delete flagged models and save the rest scoped to the cycle, then return findByCycleId', async () => {
            const toDelete = Object.assign(new SynchronizeTriggerModel(), { id: 'id-1', delete: true });
            const toSave = Object.assign(new SynchronizeTriggerModel(), { id: undefined, delete: false });
            mongooseRepository.create.mockResolvedValue(toSave);
            mongooseRepository.findByCycleId.mockResolvedValue(['final']);

            const result = await repository.replaceForCycle('cycle-1', [toDelete, toSave]);

            expect(mongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(mongooseRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cycleId: 'cycle-1' }));
            expect(result).toEqual(['final']);
        });
    });
});
