import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { CycleGroupService } from '@process/domain/services/cycle-group.service';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { ChildCycleConfig, ChildCycleRef } from '@process/domain/models/cycle.model';
import { CycleType } from '@process/domain/interfaces/executable.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateCycleModel } from './cycle.spec-mock';

function CreateChildRef(overrides: Partial<ChildCycleConfig> & { cycleId: string }): ChildCycleRef {
    const { cycleId, ...configOverrides } = overrides;
    return {
        cycleId,
        config: {
            order: 0,
            waitForCompletion: true,
            delayBefore: 0,
            delayAfter: 0,
            isSkipped: false,
            ...configOverrides
        }
    };
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// integration reelle contre un serveur Mongo en memoire (pas de mocks) : exerce le vrai schema,
// le soft delete, la generation d'id et les operations $push/$pull sur childCycles.
describe('CycleGroupService CRUD (integration mongodb-memory-server)', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let service: CycleGroupService;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const cycleModel = connection.model(Cycle.name, CycleSchema);
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        const triggerModel = connection.model(Trigger.name, TriggerSchema);

        const sequenceRepository = new SequenceMongooseRepository(sequenceModel as never);
        const scheduleRepository = new ScheduleMongooseRepository(scheduleModel as never);
        const triggerRepository = new TriggerMongooseRepository(triggerModel as never);
        const cycleRepository = new CycleMongooseRepository(
            cycleModel as never,
            sequenceRepository,
            scheduleRepository,
            triggerRepository
        );

        service = new CycleGroupService(cycleRepository, CreateLoggerMock() as never);
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('cycles').deleteMany({});
    });

    describe('create', () => {
        it('should create a new cycle with a server-generated id', async () => {
            const created = await service.create(CreateCycleModel({ name: 'Zone A' }));

            expect(created._id).toBeDefined();
            expect(created.name).toEqual('Zone A');
            expect(created.type).toEqual(CycleType.CYCLE);
            expect(created.childCycles).toEqual([]);
        });
    });

    describe('get / getAll / getRoots', () => {
        it('should read a cycle by id', async () => {
            const created = await service.create(CreateCycleModel({ name: 'Zone A' }));

            const found = await service.get(created._id);

            expect(found).toMatchObject({ _id: created._id, name: 'Zone A' });
        });

        it('should throw when reading an unknown cycle', async () => {
            await expect(service.get('missing')).rejects.toThrow(ElementNotFoundExeception);
        });

        it('should list every cycle', async () => {
            const first = await service.create(CreateCycleModel({ name: 'Zone A' }));
            const second = await service.create(CreateCycleModel({ name: 'Zone B' }));

            const all = await service.getAll();

            expect(all.map((c) => c._id).sort()).toEqual([first._id, second._id].sort());
        });

        it('should list only root cycles (no parent)', async () => {
            const parent = await service.create(CreateCycleModel({ name: 'Group', type: CycleType.GROUP }));
            const child = await service.create(CreateCycleModel({ name: 'Child' }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child._id }));

            const roots = await service.getRoots();

            expect(roots.map((c) => c._id)).toEqual([parent._id]);
        });
    });

    describe('update', () => {
        it('should update an existing cycle', async () => {
            const created = await service.create(CreateCycleModel({ name: 'Zone A' }));

            const updated = await service.update(created._id, CreateCycleModel({ name: 'Zone A renamed' }));

            expect(updated.name).toEqual('Zone A renamed');
            expect((await service.get(created._id)).name).toEqual('Zone A renamed');
        });

        it('should throw when updating an unknown cycle', async () => {
            await expect(service.update('missing', CreateCycleModel())).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('delete', () => {
        it('should soft-delete a standalone cycle', async () => {
            const created = await service.create(CreateCycleModel({ name: 'Zone A' }));

            const didDelete = await service.delete(created._id);

            expect(didDelete).toBe(true);
            await expect(service.get(created._id)).rejects.toThrow(ElementNotFoundExeception);
        });

        it('should throw when deleting an unknown cycle', async () => {
            await expect(service.delete('missing')).rejects.toThrow(ElementNotFoundExeception);
        });

        it('should refuse to delete a group cycle that still has children', async () => {
            const parent = await service.create(CreateCycleModel({ name: 'Group', type: CycleType.GROUP }));
            const child = await service.create(CreateCycleModel({ name: 'Child' }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child._id }));

            await expect(service.delete(parent._id)).rejects.toThrow(/still has 1 child cycle/);
            await expect(service.get(parent._id)).resolves.toBeDefined();
        });

        it('should detach a cycle from its parent before deleting it', async () => {
            const parent = await service.create(CreateCycleModel({ name: 'Group', type: CycleType.GROUP }));
            const child = await service.create(CreateCycleModel({ name: 'Child' }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child._id }));

            const didDelete = await service.delete(child._id);

            expect(didDelete).toBe(true);
            expect((await service.get(parent._id)).childCycles).toHaveLength(0);
        });
    });

    describe('addChild / removeChild / reorderChildren', () => {
        it('should attach children to a group and default their order to the current children count', async () => {
            const parent = await service.create(CreateCycleModel({ name: 'Group', type: CycleType.GROUP }));
            const child1 = await service.create(CreateCycleModel({ name: 'Child 1' }));
            const child2 = await service.create(CreateCycleModel({ name: 'Child 2' }));

            await service.addChild(parent._id, CreateChildRef({ cycleId: child1._id, order: undefined, delayBefore: 5, delayAfter: 10 }));
            const updatedParent = await service.addChild(parent._id, CreateChildRef({ cycleId: child2._id, order: undefined }));

            expect(updatedParent.childCycles.map((c) => ({ cycleId: c.cycleId, order: c.config.order }))).toEqual([
                { cycleId: child1._id, order: 0 },
                { cycleId: child2._id, order: 1 }
            ]);
            expect((await service.get(child1._id)).parentCycleId).toEqual(parent._id);
        });

        it('should refuse to attach a child cycle that already belongs to another parent', async () => {
            const parent1 = await service.create(CreateCycleModel({ name: 'Group 1', type: CycleType.GROUP }));
            const parent2 = await service.create(CreateCycleModel({ name: 'Group 2', type: CycleType.GROUP }));
            const child = await service.create(CreateCycleModel({ name: 'Child' }));
            await service.addChild(parent1._id, CreateChildRef({ cycleId: child._id }));

            await expect(service.addChild(parent2._id, CreateChildRef({ cycleId: child._id })))
                .rejects.toThrow(/already belongs to parent/);
        });

        it('should detach a child cycle and clear its parentCycleId', async () => {
            const parent = await service.create(CreateCycleModel({ name: 'Group', type: CycleType.GROUP }));
            const child = await service.create(CreateCycleModel({ name: 'Child' }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child._id }));

            const updatedParent = await service.removeChild(parent._id, child._id);

            expect(updatedParent.childCycles).toHaveLength(0);
            expect((await service.get(child._id)).parentCycleId).toBeNull();
        });

        it('should reorder child cycles according to the given id sequence', async () => {
            const parent = await service.create(CreateCycleModel({ name: 'Group', type: CycleType.GROUP }));
            const child1 = await service.create(CreateCycleModel({ name: 'Child 1' }));
            const child2 = await service.create(CreateCycleModel({ name: 'Child 2' }));
            const child3 = await service.create(CreateCycleModel({ name: 'Child 3' }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child1._id }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child2._id }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child3._id }));

            const reordered = await service.reorderChildren(parent._id, [child3._id, child1._id, child2._id]);

            expect(reordered.childCycles.map((c) => ({ cycleId: c.cycleId, order: c.config.order }))).toEqual([
                { cycleId: child3._id, order: 0 },
                { cycleId: child1._id, order: 1 },
                { cycleId: child2._id, order: 2 }
            ]);
        });

        it('should throw when reordering references an unknown child cycle', async () => {
            const parent = await service.create(CreateCycleModel({ name: 'Group', type: CycleType.GROUP }));
            const child = await service.create(CreateCycleModel({ name: 'Child' }));
            await service.addChild(parent._id, CreateChildRef({ cycleId: child._id }));

            await expect(service.reorderChildren(parent._id, [child._id, 'ghost-child']))
                .rejects.toThrow(ElementNotFoundExeception);
        });
    });
});
