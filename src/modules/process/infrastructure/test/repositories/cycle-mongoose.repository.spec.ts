import { Connection } from 'mongoose';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';
import { CreateCycleModel } from '@process/domain/test/services/cycle.spec-mock';

describe('CycleMongooseRepository not-found branches (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: CycleMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const cycleModel = connection.model(Cycle.name, CycleSchema);
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        const triggerModel = connection.model(Trigger.name, TriggerSchema);
        repository = new CycleMongooseRepository(
            cycleModel as never,
            new SequenceMongooseRepository(sequenceModel as never),
            new ScheduleMongooseRepository(scheduleModel as never),
            new TriggerMongooseRepository(triggerModel as never)
        );
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('cycles').deleteMany({});
    });

    describe('delete', () => {
        it('should throw ElementNotFoundExeception when the cycle does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('addChild', () => {
        it('should throw ElementNotFoundExeception when the parent cycle does not exist', async () => {
            await expect(repository.addChild('missing-id', { cycleId: 'child-1', config: { order: 0 } } as never)).rejects.toThrow(ElementNotFoundExeception);
        });

        it('should push the child onto an existing parent cycle', async () => {
            const parent = await repository.create(CreateCycleModel({ name: 'parent' }));

            const updated = await repository.addChild(parent._id, { cycleId: 'child-1', config: { order: 0 } } as never);

            expect(updated.childCycles).toEqual([{
                cycleId: 'child-1',
                config: { order: 0, waitForCompletion: true, delayBefore: 0, delayAfter: 0, isSkipped: false }
            }]);
        });
    });

    describe('removeChild', () => {
        it('should throw ElementNotFoundExeception when the parent cycle does not exist', async () => {
            await expect(repository.removeChild('missing-id', 'child-1')).rejects.toThrow(ElementNotFoundExeception);
        });

        it('should pull the child off an existing parent cycle', async () => {
            const parent = await repository.create(CreateCycleModel({ name: 'parent' }));
            await repository.addChild(parent._id, { cycleId: 'child-1', config: { order: 0 } } as never);

            const updated = await repository.removeChild(parent._id, 'child-1');

            expect(updated.childCycles).toEqual([]);
        });
    });
});
