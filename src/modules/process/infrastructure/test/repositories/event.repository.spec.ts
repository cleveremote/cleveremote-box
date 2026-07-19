import { EventRepository } from '@process/infrastructure/repositories/event.repository';
import { EventMongooseRepository } from '@process/infrastructure/repositories/event-mongoose.repository';
import { EventModel } from '@process/domain/models/event.model';

describe('EventRepository', () => {
    let mongooseRepository: { create: jest.Mock; findByDeviceAndDateRange: jest.Mock; findLastByDevice: jest.Mock };
    let repository: EventRepository;

    beforeEach(() => {
        mongooseRepository = { create: jest.fn(), findByDeviceAndDateRange: jest.fn(), findLastByDevice: jest.fn() };
        repository = new EventRepository(mongooseRepository as never as EventMongooseRepository);
    });

    describe('save', () => {
        it('should delegate to mongooseRepository.create', async () => {
            const model = new EventModel();
            mongooseRepository.create.mockResolvedValue(model);

            const result = await repository.save(model);

            expect(mongooseRepository.create).toHaveBeenCalledWith(model);
            expect(result).toEqual(model);
        });
    });

    describe('getByDeviceAndDateRange', () => {
        it('should delegate to mongooseRepository.findByDeviceAndDateRange', async () => {
            const events = [new EventModel()];
            const startDate = new Date('2026-01-01');
            const endDate = new Date('2026-01-02');
            mongooseRepository.findByDeviceAndDateRange.mockResolvedValue(events);

            const result = await repository.getByDeviceAndDateRange('device-1', startDate, endDate);

            expect(mongooseRepository.findByDeviceAndDateRange).toHaveBeenCalledWith('device-1', startDate, endDate);
            expect(result).toEqual(events);
        });
    });

    describe('getLast', () => {
        it('should delegate to mongooseRepository.findLastByDevice', async () => {
            const event = new EventModel();
            mongooseRepository.findLastByDevice.mockResolvedValue(event);

            const result = await repository.getLast('device-1');

            expect(mongooseRepository.findLastByDevice).toHaveBeenCalledWith('device-1');
            expect(result).toEqual(event);
        });
    });
});
