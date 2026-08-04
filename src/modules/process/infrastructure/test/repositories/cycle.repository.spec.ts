import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SynchronizeCycleModel } from '@process/domain/models/synchronize.model';
import { ElementNotFoundExeception, InvalidIdException } from '@process/domain/errors/db-errors';

describe('CycleRepository', () => {
    let cycleMongooseRepository: { create: jest.Mock; upsert: jest.Mock; delete: jest.Mock; findAll: jest.Mock; findById: jest.Mock; addChild: jest.Mock; removeChild: jest.Mock };
    let sequenceRepository: { deleteForCycle: jest.Mock; replaceForCycle: jest.Mock };
    let scheduleRepository: { deleteForCycle: jest.Mock; replaceForCycle: jest.Mock };
    let triggerRepository: { deleteForCycle: jest.Mock; replaceForCycle: jest.Mock };
    let repository: CycleRepository;

    beforeEach(() => {
        cycleMongooseRepository = { create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findAll: jest.fn(), findById: jest.fn(), addChild: jest.fn(), removeChild: jest.fn() };
        sequenceRepository = { deleteForCycle: jest.fn(), replaceForCycle: jest.fn() };
        scheduleRepository = { deleteForCycle: jest.fn(), replaceForCycle: jest.fn() };
        triggerRepository = { deleteForCycle: jest.fn(), replaceForCycle: jest.fn() };
        repository = new CycleRepository(
            cycleMongooseRepository as never as CycleMongooseRepository,
            sequenceRepository as never as SequenceRepository,
            scheduleRepository as never as ScheduleRepository,
            triggerRepository as never as TriggerRepository
        );
    });

    describe('save', () => {
        it('should create when the model has no _id', async () => {
            const model = new CycleModel();
            cycleMongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(cycleMongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });

        it('should upsert when the model has a valid uuid _id', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a' });
            cycleMongooseRepository.upsert.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(cycleMongooseRepository.upsert).toHaveBeenCalledWith(model._id, model);
            expect(result).toEqual(model);
        });

        it('should throw InvalidIdException when the _id is not a valid uuid', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'not-a-uuid' });

            await expect(repository.save(model)).rejects.toThrow(InvalidIdException);
        });

        it('should add the child ref to the new parent when parentCycleId goes from null to a value', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a', parentCycleId: 'parent-1' });
            cycleMongooseRepository.findById
                .mockResolvedValueOnce(null) // previous state of the saved cycle: didn't exist yet
                .mockResolvedValueOnce(Object.assign(new CycleModel(), { _id: 'parent-1', childCycles: [] })); // parent lookup
            cycleMongooseRepository.upsert.mockResolvedValue(model);

            await repository.save(model);

            expect(cycleMongooseRepository.addChild).toHaveBeenCalledWith('parent-1', expect.objectContaining({
                cycleId: model._id,
                config: expect.objectContaining({ order: 0 })
            }));
        });

        it('should not duplicate the child ref when the parent already has it (idempotent resync)', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a', parentCycleId: 'parent-1' });
            const previous = Object.assign(new CycleModel(), { _id: model._id, parentCycleId: 'parent-1' });
            cycleMongooseRepository.findById
                .mockResolvedValueOnce(previous)
                .mockResolvedValueOnce(Object.assign(new CycleModel(), {
                    _id: 'parent-1',
                    childCycles: [{ cycleId: model._id, config: { order: 0, waitForCompletion: true, delayBefore: 0, delayAfter: 0, isSkipped: false } }]
                }));
            cycleMongooseRepository.upsert.mockResolvedValue(model);

            await repository.save(model);

            expect(cycleMongooseRepository.addChild).not.toHaveBeenCalled();
        });

        it('should move the child ref when parentCycleId changes to a different parent', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a', parentCycleId: 'parent-2' });
            const previous = Object.assign(new CycleModel(), { _id: model._id, parentCycleId: 'parent-1' });
            cycleMongooseRepository.findById
                .mockResolvedValueOnce(previous)
                .mockResolvedValueOnce(Object.assign(new CycleModel(), { _id: 'parent-2', childCycles: [] }));
            cycleMongooseRepository.upsert.mockResolvedValue(model);
            cycleMongooseRepository.removeChild.mockResolvedValue(previous);

            await repository.save(model);

            expect(cycleMongooseRepository.removeChild).toHaveBeenCalledWith('parent-1', model._id);
            expect(cycleMongooseRepository.addChild).toHaveBeenCalledWith('parent-2', expect.objectContaining({ cycleId: model._id }));
        });

        it('should remove the child ref from the old parent when parentCycleId is cleared', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a', parentCycleId: null });
            const previous = Object.assign(new CycleModel(), { _id: model._id, parentCycleId: 'parent-1' });
            cycleMongooseRepository.findById.mockResolvedValueOnce(previous);
            cycleMongooseRepository.upsert.mockResolvedValue(model);
            cycleMongooseRepository.removeChild.mockResolvedValue(previous);

            await repository.save(model);

            expect(cycleMongooseRepository.removeChild).toHaveBeenCalledWith('parent-1', model._id);
            expect(cycleMongooseRepository.addChild).not.toHaveBeenCalled();
        });

        it('should not call addChild when the target parent does not exist', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a', parentCycleId: 'missing-parent' });
            cycleMongooseRepository.findById
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null); // parent lookup: not found
            cycleMongooseRepository.upsert.mockResolvedValue(model);

            await repository.save(model);

            expect(cycleMongooseRepository.addChild).not.toHaveBeenCalled();
        });

        it('should not fail the save when the old parent no longer exists', async () => {
            const model = Object.assign(new CycleModel(), { _id: 'e2f6c8a0-1b2c-4d3e-9f4a-5b6c7d8e9f0a', parentCycleId: null });
            const previous = Object.assign(new CycleModel(), { _id: model._id, parentCycleId: 'gone-parent' });
            cycleMongooseRepository.findById.mockResolvedValueOnce(previous);
            cycleMongooseRepository.upsert.mockResolvedValue(model);
            cycleMongooseRepository.removeChild.mockRejectedValue(new ElementNotFoundExeception('gone-parent', 'update', 'cycle'));

            await expect(repository.save(model)).resolves.toEqual(model);
        });
    });

    describe('delete', () => {
        it('should cascade-delete sequences, schedules and triggers before deleting the cycle', async () => {
            cycleMongooseRepository.delete.mockResolvedValue(true);

            const result = await repository.delete('cycle-1');

            expect(sequenceRepository.deleteForCycle).toHaveBeenCalledWith('cycle-1');
            expect(scheduleRepository.deleteForCycle).toHaveBeenCalledWith('cycle-1');
            expect(triggerRepository.deleteForCycle).toHaveBeenCalledWith('cycle-1');
            expect(cycleMongooseRepository.delete).toHaveBeenCalledWith('cycle-1');
            expect(result).toEqual(true);
        });

        it('should remove the child ref from its parent when the deleted cycle had one', async () => {
            cycleMongooseRepository.findById.mockResolvedValue(Object.assign(new CycleModel(), { _id: 'cycle-1', parentCycleId: 'parent-1' }));
            cycleMongooseRepository.delete.mockResolvedValue(true);

            await repository.delete('cycle-1');

            expect(cycleMongooseRepository.removeChild).toHaveBeenCalledWith('parent-1', 'cycle-1');
        });

        it('should not call removeChild when the deleted cycle had no parent', async () => {
            cycleMongooseRepository.findById.mockResolvedValue(Object.assign(new CycleModel(), { _id: 'cycle-1', parentCycleId: null }));
            cycleMongooseRepository.delete.mockResolvedValue(true);

            await repository.delete('cycle-1');

            expect(cycleMongooseRepository.removeChild).not.toHaveBeenCalled();
        });
    });

    describe('get', () => {
        it('should return findAll when no id is given', async () => {
            cycleMongooseRepository.findAll.mockResolvedValue([]);

            const result = await repository.get();

            expect(cycleMongooseRepository.findAll).toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        it('should return findById when an id is given', async () => {
            const model = new CycleModel();
            cycleMongooseRepository.findById.mockResolvedValue(model);

            const result = await repository.get('id-1');

            expect(cycleMongooseRepository.findById).toHaveBeenCalledWith('id-1');
            expect(result).toEqual(model);
        });
    });

    describe('replaceAll', () => {
        it('should delete a cycle flagged for deletion, cascading through delete()', async () => {
            const toDelete = Object.assign(new SynchronizeCycleModel(), { _id: 'id-1', delete: true });
            cycleMongooseRepository.findAll.mockResolvedValue([]);

            await repository.replaceAll([toDelete]);

            expect(cycleMongooseRepository.delete).toHaveBeenCalledWith('id-1');
            expect(sequenceRepository.deleteForCycle).toHaveBeenCalledWith('id-1');
        });

        it('should save a cycle and replace its sequences, schedules and triggers', async () => {
            const model = Object.assign(new SynchronizeCycleModel(), {
                _id: undefined,
                delete: false,
                sequences: [{ id: 'seq-1' }],
                schedules: [{ id: 'sched-1' }],
                triggers: [{ id: 'trig-1' }]
            });
            const saved = Object.assign(new CycleModel(), { _id: 'cycle-1' });
            cycleMongooseRepository.create.mockResolvedValue(saved);
            sequenceRepository.replaceForCycle.mockResolvedValue(['seq']);
            scheduleRepository.replaceForCycle.mockResolvedValue(['sched']);
            triggerRepository.replaceForCycle.mockResolvedValue(['trig']);
            cycleMongooseRepository.findAll.mockResolvedValue(['final']);

            const result = await repository.replaceAll([model]);

            expect(sequenceRepository.replaceForCycle).toHaveBeenCalledWith('cycle-1', model.sequences);
            expect(scheduleRepository.replaceForCycle).toHaveBeenCalledWith('cycle-1', model.schedules);
            expect(triggerRepository.replaceForCycle).toHaveBeenCalledWith('cycle-1', model.triggers);
            expect(result).toEqual(['final']);
        });

        it('should default sequences/schedules/triggers to empty arrays when absent', async () => {
            const model = Object.assign(new SynchronizeCycleModel(), { _id: undefined, delete: false, sequences: undefined, schedules: undefined, triggers: undefined });
            const saved = Object.assign(new CycleModel(), { _id: 'cycle-1' });
            cycleMongooseRepository.create.mockResolvedValue(saved);
            sequenceRepository.replaceForCycle.mockResolvedValue([]);
            scheduleRepository.replaceForCycle.mockResolvedValue([]);
            triggerRepository.replaceForCycle.mockResolvedValue([]);
            cycleMongooseRepository.findAll.mockResolvedValue([]);

            await repository.replaceAll([model]);

            expect(sequenceRepository.replaceForCycle).toHaveBeenCalledWith('cycle-1', []);
            expect(scheduleRepository.replaceForCycle).toHaveBeenCalledWith('cycle-1', []);
            expect(triggerRepository.replaceForCycle).toHaveBeenCalledWith('cycle-1', []);
        });
    });
});
