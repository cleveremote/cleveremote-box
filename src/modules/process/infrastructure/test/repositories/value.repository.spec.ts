import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { EventRepository } from '@process/infrastructure/repositories/event.repository';
import { StructureService } from '@process/domain/services/configuration.service';
import { StructureModel } from '@process/domain/models/structure.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { EventModel } from '@process/domain/models/event.model';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';

describe('ValueRepository', () => {
    let eventRepository: { getByDeviceAndDateRange: jest.Mock; getLast: jest.Mock };
    let structureService: { structure: StructureModel };
    let repository: ValueRepository;

    beforeEach(() => {
        eventRepository = { getByDeviceAndDateRange: jest.fn(), getLast: jest.fn() };
        structureService = { structure: new StructureModel() };
        repository = new ValueRepository(eventRepository as never as EventRepository, structureService as never as StructureService);
    });

    describe('getEvents', () => {
        it('should delegate to eventRepository with parsed dates', async () => {
            const events = [new EventModel()];
            eventRepository.getByDeviceAndDateRange.mockResolvedValue(events);

            const result = await repository.getEvents({ deviceId: 'device-1', startDate: '2026-01-01', endDate: '2026-01-02' });

            expect(eventRepository.getByDeviceAndDateRange).toHaveBeenCalledWith('device-1', new Date('2026-01-01'), new Date('2026-01-02'));
            expect(result).toEqual(events);
        });
    });

    describe('getLastValue', () => {
        it('should delegate to eventRepository.getLast', async () => {
            const event = new EventModel();
            eventRepository.getLast.mockResolvedValue(event);

            const result = await repository.getLastValue('device-1');

            expect(eventRepository.getLast).toHaveBeenCalledWith('device-1');
            expect(result).toEqual(event);
        });
    });

    describe('getDeviceValue', () => {
        it('should return a ProcessValueModel when the id matches a cycle', async () => {
            const cycle = Object.assign(new CycleModel(), { _id: 'cycle-1', status: ExecutableStatus.IN_PROCCESS, sequences: [] });
            structureService.structure.cycles = [cycle];

            const result = await repository.getDeviceValue('cycle-1');

            expect(result).toEqual({ id: 'cycle-1', status: ExecutableStatus.IN_PROCCESS });
        });

        it('should return a ProcessValueModel when the id matches a sequence of a cycle', async () => {
            const sequence = Object.assign(new SequenceModel(), { _id: 'sequence-1', status: ExecutableStatus.STOPPED });
            const cycle = Object.assign(new CycleModel(), { _id: 'cycle-1', status: ExecutableStatus.STOPPED, sequences: [sequence] });
            structureService.structure.cycles = [cycle];

            const result = await repository.getDeviceValue('sequence-1');

            expect(result).toEqual({ id: 'sequence-1', status: ExecutableStatus.STOPPED });
        });

        it('should return a SensorValueModel when the id matches a sensor with a value', async () => {
            const sensor = Object.assign(new SensorModel(), { id: 'sensor-1', value: 42, date: new Date('2026-01-01') });
            structureService.structure.sensors = [sensor];

            const result = await repository.getDeviceValue('sensor-1');

            expect(result).toEqual({ id: 'sensor-1', value: 42, date: sensor.date });
        });

        it('should return undefined when the matched sensor has no value', async () => {
            const sensor = Object.assign(new SensorModel(), { id: 'sensor-1', value: undefined });
            structureService.structure.sensors = [sensor];

            const result = await repository.getDeviceValue('sensor-1');

            expect(result).toBeUndefined();
        });

        it('should return undefined when the id matches nothing', async () => {
            const result = await repository.getDeviceValue('unknown-id');

            expect(result).toBeUndefined();
        });
    });
});
