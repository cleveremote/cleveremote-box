import { Connection } from 'mongoose';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';
import { CreateTriggerModel } from '@process/domain/test/services/trigger.spec-mock';

describe('TriggerMongooseRepository (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: TriggerMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('triggers').deleteMany({});
        const triggerModel = connection.model(Trigger.name, TriggerSchema);
        repository = new TriggerMongooseRepository(triggerModel as never);
    });

    describe('create', () => {
        it('should persist and return the mapped trigger', async () => {
            const created = await repository.create(CreateTriggerModel({ id: undefined, name: 'trigger-1' }));

            expect(created.id).toBeDefined();
            expect(created.name).toEqual('trigger-1');
        });
    });

    describe('upsert', () => {
        it('should insert a new trigger when the id does not exist yet', async () => {
            const upserted = await repository.upsert('new-id', CreateTriggerModel({ id: undefined, name: 'upserted' }));

            expect(upserted.id).toEqual('new-id');
            expect(upserted.name).toEqual('upserted');
        });

        it('should update the trigger when the id already exists', async () => {
            const created = await repository.create(CreateTriggerModel({ id: undefined }));

            const upserted = await repository.upsert(created.id, CreateTriggerModel({ id: undefined, name: 'updated' }));

            expect(upserted.name).toEqual('updated');
        });
    });

    describe('delete', () => {
        it('should soft-delete an existing trigger', async () => {
            const created = await repository.create(CreateTriggerModel({ id: undefined }));

            const result = await repository.delete(created.id);

            expect(result).toEqual(true);
            expect(await repository.findById(created.id)).toBeNull();
        });

        it('should throw ElementNotFoundExeception when the trigger does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('findById', () => {
        it('should return null when not found', async () => {
            expect(await repository.findById('missing-id')).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return only non-deleted triggers', async () => {
            const kept = await repository.create(CreateTriggerModel({ id: undefined, name: 'kept' }));
            const deleted = await repository.create(CreateTriggerModel({ id: undefined, name: 'deleted' }));
            await repository.delete(deleted.id);

            const all = await repository.findAll();

            expect(all.map((t) => t.id)).toEqual([kept.id]);
        });
    });

    describe('findByCycleId', () => {
        it('should return only non-deleted triggers matching the cycleId', async () => {
            const match = await repository.create(CreateTriggerModel({ id: undefined, cycleId: 'cycle-1' }));
            await repository.create(CreateTriggerModel({ id: undefined, cycleId: 'cycle-2' }));

            const result = await repository.findByCycleId('cycle-1');

            expect(result.map((t) => t.id)).toEqual([match.id]);
        });
    });
});
