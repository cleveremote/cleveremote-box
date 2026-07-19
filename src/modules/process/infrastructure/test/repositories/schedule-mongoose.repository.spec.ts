import { Connection } from 'mongoose';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';
import { CreateScheduleModel } from '@process/domain/test/services/schedule.spec-mock';

describe('ScheduleMongooseRepository (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: ScheduleMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('schedules').deleteMany({});
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        repository = new ScheduleMongooseRepository(scheduleModel as never);
    });

    describe('create', () => {
        it('should persist and return the mapped schedule', async () => {
            const created = await repository.create(CreateScheduleModel({ _id: undefined, name: 'schedule-1' }));

            expect(created._id).toBeDefined();
            expect(created.name).toEqual('schedule-1');
        });
    });

    describe('upsert', () => {
        it('should insert a new schedule when the id does not exist yet', async () => {
            const upserted = await repository.upsert('new-id', CreateScheduleModel({ _id: undefined, name: 'upserted' }));

            expect(upserted._id).toEqual('new-id');
            expect(upserted.name).toEqual('upserted');
        });

        it('should update the schedule when the id already exists', async () => {
            const created = await repository.create(CreateScheduleModel({ _id: undefined }));

            const upserted = await repository.upsert(created._id, CreateScheduleModel({ _id: undefined, name: 'updated' }));

            expect(upserted.name).toEqual('updated');
        });
    });

    describe('delete', () => {
        it('should soft-delete an existing schedule', async () => {
            const created = await repository.create(CreateScheduleModel({ _id: undefined }));

            const result = await repository.delete(created._id);

            expect(result).toEqual(true);
            expect(await repository.findById(created._id)).toBeNull();
        });

        it('should throw ElementNotFoundExeception when the schedule does not exist', async () => {
            await expect(repository.delete('missing-id')).rejects.toThrow(ElementNotFoundExeception);
        });
    });

    describe('findById', () => {
        it('should return null when not found', async () => {
            expect(await repository.findById('missing-id')).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return only non-deleted schedules', async () => {
            const kept = await repository.create(CreateScheduleModel({ _id: undefined, name: 'kept' }));
            const deleted = await repository.create(CreateScheduleModel({ _id: undefined, name: 'deleted' }));
            await repository.delete(deleted._id);

            const all = await repository.findAll();

            expect(all.map((s) => s._id)).toEqual([kept._id]);
        });
    });

    describe('findByCycleId', () => {
        it('should return only non-deleted schedules matching the cycleId', async () => {
            const match = await repository.create(CreateScheduleModel({ _id: undefined, cycleId: 'cycle-1' }));
            await repository.create(CreateScheduleModel({ _id: undefined, cycleId: 'cycle-2' }));

            const result = await repository.findByCycleId('cycle-1');

            expect(result.map((s) => s._id)).toEqual([match._id]);
        });
    });
});
