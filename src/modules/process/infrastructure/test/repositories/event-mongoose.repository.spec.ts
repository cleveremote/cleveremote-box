import { Connection } from 'mongoose';
import { EventMongooseRepository } from '@process/infrastructure/repositories/event-mongoose.repository';
import { Event, EventSchema } from '@process/infrastructure/schemas/event.schema';
import { EventModel, ElementType, ProcessEventData } from '@process/domain/models/event.model';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';

function CreateEventModel(overrides: Partial<EventModel> = {}): EventModel {
    const event = new EventModel();
    event.elementId = 'device-1';
    event.date = new Date('2026-01-01T00:00:00Z');
    event.elementType = ElementType.CYCLE;
    const data = new ProcessEventData();
    data.type = 'manual';
    data.value = ExecutableStatus.STOPPED;
    event.additionalData = data;
    return Object.assign(event, overrides);
}

describe('EventMongooseRepository (integration mongodb-memory-server)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let repository: EventMongooseRepository;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('events').deleteMany({});
        const eventModel = connection.model(Event.name, EventSchema);
        repository = new EventMongooseRepository(eventModel as never);
    });

    describe('create', () => {
        it('should persist and return the mapped event', async () => {
            const created = await repository.create(CreateEventModel());

            expect(created._id).toBeDefined();
            expect(created.elementId).toEqual('device-1');
        });
    });

    describe('findByDeviceAndDateRange', () => {
        it('should return events for the element within the date range, sorted by date ascending', async () => {
            await repository.create(CreateEventModel({ date: new Date('2026-01-02') }));
            await repository.create(CreateEventModel({ date: new Date('2026-01-01') }));
            await repository.create(CreateEventModel({ elementId: 'device-2', date: new Date('2026-01-01') }));
            await repository.create(CreateEventModel({ date: new Date('2026-03-01') }));

            const result = await repository.findByDeviceAndDateRange('device-1', new Date('2026-01-01'), new Date('2026-01-31'));

            expect(result).toHaveLength(2);
            expect(result[0].date.getTime()).toBeLessThan(result[1].date.getTime());
        });
    });

    describe('findLastByDevice', () => {
        it('should return the most recent event for the element', async () => {
            await repository.create(CreateEventModel({ date: new Date('2026-01-01') }));
            const latest = await repository.create(CreateEventModel({ date: new Date('2026-06-01') }));

            const result = await repository.findLastByDevice('device-1');

            expect(result._id).toEqual(latest._id);
        });

        it('should return null when the element has no events', async () => {
            const result = await repository.findLastByDevice('unknown-device');

            expect(result).toBeNull();
        });
    });
});
