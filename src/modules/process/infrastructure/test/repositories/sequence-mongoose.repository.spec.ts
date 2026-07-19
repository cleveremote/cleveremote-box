import { Connection } from 'mongoose';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';

function CreateSequenceModel(overrides: Partial<SequenceModel> = {}): SequenceModel {
    const sequence = new SequenceModel();
    sequence.cycleId = 'cycle-1';
    sequence.name = 'sequence';
    sequence.description = 'description';
    sequence.status = ExecutableStatus.STOPPED;
    sequence.order = 0;
    sequence.securityConfig = { maxDuration: 10 };
    sequence.moduleConfigs = [];
    return Object.assign(sequence, overrides);
}

describe('SequenceMongooseRepository (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: SequenceMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('sequences').deleteMany({});
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        repository = new SequenceMongooseRepository(sequenceModel as never);
    });

    describe('create', () => {
        it('should persist and return the mapped sequence', async () => {
            const created = await repository.create(CreateSequenceModel({ name: 'sequence-1' }));

            expect(created._id).toBeDefined();
            expect(created.name).toEqual('sequence-1');
        });
    });

    describe('upsert', () => {
        it('should insert a new sequence when the id does not exist yet', async () => {
            const upserted = await repository.upsert('new-id', CreateSequenceModel({ name: 'upserted' }));

            expect(upserted._id).toEqual('new-id');
            expect(upserted.name).toEqual('upserted');
        });

        it('should update the sequence when the id already exists', async () => {
            const created = await repository.create(CreateSequenceModel());

            const upserted = await repository.upsert(created._id, CreateSequenceModel({ name: 'updated' }));

            expect(upserted.name).toEqual('updated');
        });
    });

    describe('delete', () => {
        it('should soft-delete an existing sequence', async () => {
            const created = await repository.create(CreateSequenceModel());

            const result = await repository.delete(created._id);

            expect(result).toEqual(true);
            expect(await repository.findById(created._id)).toBeNull();
        });

        it('should throw ElementNotFoundExeception when the sequence does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('findById', () => {
        it('should return null when not found', async () => {
            expect(await repository.findById('missing-id')).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return only non-deleted sequences', async () => {
            const kept = await repository.create(CreateSequenceModel({ name: 'kept' }));
            const deleted = await repository.create(CreateSequenceModel({ name: 'deleted' }));
            await repository.delete(deleted._id);

            const all = await repository.findAll();

            expect(all.map((s) => s._id)).toEqual([kept._id]);
        });
    });

    describe('findByCycleId', () => {
        it('should return only non-deleted sequences matching the cycleId', async () => {
            const match = await repository.create(CreateSequenceModel({ cycleId: 'cycle-1' }));
            await repository.create(CreateSequenceModel({ cycleId: 'cycle-2' }));

            const result = await repository.findByCycleId('cycle-1');

            expect(result.map((s) => s._id)).toEqual([match._id]);
        });
    });
});
