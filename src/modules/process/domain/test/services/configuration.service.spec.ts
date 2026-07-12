import { Connection } from 'mongoose';
import { StructureService } from '@process/domain/services/configuration.service';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ValueModel, ExecutableType } from '@process/domain/models/value.model';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateCycleModel } from './cycle.spec-mock';

function CreateEmptyGetRepositoryMock(): { get: jest.Mock } {
    return { get: jest.fn().mockResolvedValue([]) };
}

describe('StructureService (integration mongodb-memory-server for cycles)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let cycleRepository: CycleRepository;
    let sequenceMongooseRepository: SequenceMongooseRepository;
    let sensorRepository: ReturnType<typeof CreateEmptyGetRepositoryMock>;
    let deviceRepository: ReturnType<typeof CreateEmptyGetRepositoryMock>;
    let modbusTaskRepository: ReturnType<typeof CreateEmptyGetRepositoryMock>;
    let actuatorRepository: ReturnType<typeof CreateEmptyGetRepositoryMock>;
    let eventRepository: { save: jest.Mock; getLast: jest.Mock; getByDeviceAndDateRange: jest.Mock };
    let service: StructureService;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const cycleModel = connection.model(Cycle.name, CycleSchema);
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        const triggerModel = connection.model(Trigger.name, TriggerSchema);
        sequenceMongooseRepository = new SequenceMongooseRepository(sequenceModel as never);

        cycleRepository = new CycleRepository(
            new CycleMongooseRepository(
                cycleModel as never,
                sequenceMongooseRepository,
                new ScheduleMongooseRepository(scheduleModel as never),
                new TriggerMongooseRepository(triggerModel as never)
            ),
            {} as never,
            {} as never,
            {} as never
        );
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('cycles').deleteMany({});

        sensorRepository = CreateEmptyGetRepositoryMock();
        deviceRepository = CreateEmptyGetRepositoryMock();
        modbusTaskRepository = CreateEmptyGetRepositoryMock();
        actuatorRepository = CreateEmptyGetRepositoryMock();
        eventRepository = {
            save: jest.fn().mockResolvedValue(undefined),
            getLast: jest.fn().mockResolvedValue(null),
            getByDeviceAndDateRange: jest.fn().mockResolvedValue([])
        };

        service = new StructureService(
            cycleRepository,
            sensorRepository as never,
            deviceRepository as never,
            modbusTaskRepository as never,
            eventRepository as never,
            actuatorRepository as never
        );
    });

    describe('getStructure', () => {
        it('should build the structure from the persisted cycles and set service.structure', async () => {
            await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));

            const structure = await service.getStructure();

            expect(structure.cycles).toHaveLength(1);
            expect(structure.cycles[0].name).toEqual('Zone A');
            expect(service.structure).toBe(structure);
        });

        // le statut vit directement sur CycleModel/SequenceModel (defaut STOPPED du schema Mongo) :
        // resetAllModules() le force de toute facon a STOPPED au boot, plus besoin de le
        // reconstruire depuis un store separe.
        it('should leave a freshly loaded cycle at its default STOPPED status', async () => {
            await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));

            const structure = await service.getStructure();

            expect(structure.cycles[0].status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should populate a sensor\'s value/date from its last known event, and reflect it in structure.values', async () => {
            const lastEventDate = new Date('2024-01-01T00:00:00.000Z');
            sensorRepository.get.mockResolvedValue([{ id: 'sensor-1' }]);
            eventRepository.getLast.mockResolvedValue({ elementId: 'sensor-1', additionalData: { value: '42' }, date: lastEventDate });

            const structure = await service.getStructure();

            expect(structure.sensors[0].value).toEqual(42);
            expect(structure.sensors[0].date).toEqual(lastEventDate);
            expect(structure.values).toContainEqual({ id: 'sensor-1', value: 42, type: 'SENSOR', date: lastEventDate });
        });

        it('should leave structure.values empty when no sensor has a known reading yet', async () => {
            sensorRepository.get.mockResolvedValue([{ id: 'sensor-1' }]);
            eventRepository.getLast.mockResolvedValue(null);

            const structure = await service.getStructure();

            expect(structure.values).toEqual([]);
        });

        it('should aggregate sequences/schedules/triggers across every cycle', async () => {
            const first = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const second = await cycleRepository.save(CreateCycleModel({ name: 'Zone B' }));

            await service.getStructure();

            expect(service.sequences).toBeDefined();
            expect(service.schedules).toBeDefined();
            expect(service.triggers).toBeDefined();
            expect(service.structure.cycles.map((c) => c._id).sort()).toEqual([first._id, second._id].sort());
        });

        it('should register one deviceListener per cycle', async () => {
            await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            await cycleRepository.save(CreateCycleModel({ name: 'Zone B' }));

            await service.getStructure();

            expect(service.deviceListeners).toHaveLength(2);
        });
    });

    describe('getConfigurationWithStatus', () => {
        it('should delegate to getStructure() (status is already authoritative on the in-memory models)', async () => {
            const getStructureSpy = jest.spyOn(service, 'getStructure');

            const structure = await service.getConfigurationWithStatus();

            expect(getStructureSpy).toHaveBeenCalled();
            expect(structure).toBe(service.structure);
        });
    });

    describe('getEvents', () => {
        it('should delegate to eventRepository.getByDeviceAndDateRange with parsed dates', async () => {
            const query = { deviceId: 'device-1', startDate: '2024-01-01', endDate: '2024-01-31' };

            await service.getEvents(query);

            expect(eventRepository.getByDeviceAndDateRange).toHaveBeenCalledWith(
                'device-1', new Date('2024-01-01'), new Date('2024-01-31')
            );
        });
    });

    describe('getStatus', () => {
        beforeEach(() => {
            const cycle = Object.assign(new CycleModel(), {
                _id: 'cycle-1', status: ExecutableStatus.IN_PROCCESS, sequences: []
            });
            const sequence = Object.assign(new SequenceModel(), {
                _id: 'seq-1', cycleId: 'cycle-1', status: ExecutableStatus.STOPPED
            });
            cycle.sequences = [sequence];
            const sensor = Object.assign(new SensorModel(), { id: 'sensor-1', value: 42, date: new Date('2024-01-01') });
            service.structure = Object.assign(new StructureModel(), { cycles: [cycle], sensors: [sensor] });
        });

        it('should return only cycle process values for type CYCLE', async () => {
            const result = await service.getStatus('CYCLE') as ProcessValueModel[];

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({ id: 'cycle-1', type: ExecutableType.CYCLE, status: ExecutableStatus.IN_PROCCESS });
        });

        it('should return only sequence process values for type SEQUENCE', async () => {
            const result = await service.getStatus('SEQUENCE') as ProcessValueModel[];

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({ id: 'seq-1', type: ExecutableType.SEQUENCE, status: ExecutableStatus.STOPPED });
        });

        it('should return every sensor value for type SENSOR', async () => {
            const result = await service.getStatus('SENSOR') as SensorValueModel[];

            expect(result).toEqual([expect.objectContaining({ id: 'sensor-1', value: 42 })]);
        });

        it('should return processes and sensors together for an unrecognized type', async () => {
            const result = await service.getStatus('UNKNOWN') as ValueModel;

            expect(result.processes).toHaveLength(2);
            expect(result.sensors).toHaveLength(1);
        });
    });
});
