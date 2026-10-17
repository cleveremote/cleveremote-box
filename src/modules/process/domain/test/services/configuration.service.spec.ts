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
import { DeviceRangeType, DeviceType, DiscoveryAddressRegister, SlaveTemplate } from '@process/domain/models/device.model';
import { ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { isValidUuid } from '@process/domain/utils/id.util';

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
            actuatorRepository as never,
            {} as never,
            {} as never
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

        // passe car eventRepository.getLast renvoie null par defaut (beforeEach) : aucun evenement
        // connu pour ce cycle, donc le defaut STOPPED du schema Mongo est conserve tel quel.
        it('should leave a freshly loaded cycle at its default STOPPED status when it has no known event', async () => {
            await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));

            const structure = await service.getStructure();

            expect(structure.cycles[0].status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should rehydrate a cycle\'s status/progression from its last known event (IN_PROCCESS)', async () => {
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const startedAt = new Date('2026-07-30T10:00:00.000Z');
            eventRepository.getLast.mockImplementation((id: string) => Promise.resolve(
                id === cycle._id
                    ? {
                        elementId: id,
                        additionalData: { status: ExecutableStatus.IN_PROCCESS, value: ExecutableStatus.IN_PROCCESS, startedAt, duration: 300 }
                    }
                    : null
            ));

            const structure = await service.getStructure();

            expect(structure.cycles[0].status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(structure.cycles[0].progression).toEqual({ startedAt, duration: 300 });
            expect(eventRepository.getLast).toHaveBeenCalledWith(cycle._id);
        });

        it('should not set progression when the last known cycle event is STOPPED', async () => {
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            eventRepository.getLast.mockImplementation((id: string) => Promise.resolve(
                id === cycle._id
                    ? {
                        elementId: id,
                        additionalData: { status: ExecutableStatus.STOPPED, value: ExecutableStatus.STOPPED, startedAt: new Date(), duration: 300 }
                    }
                    : null
            ));

            const structure = await service.getStructure();

            expect(structure.cycles[0].status).toEqual(ExecutableStatus.STOPPED);
            expect(structure.cycles[0].progression).toBeFalsy();
        });

        it('should rehydrate a WAITTING_CONFIRMATION cycle status without setting progression', async () => {
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            eventRepository.getLast.mockImplementation((id: string) => Promise.resolve(
                id === cycle._id
                    ? {
                        elementId: id,
                        additionalData: {
                            status: ExecutableStatus.WAITTING_CONFIRMATION,
                            value: ExecutableStatus.WAITTING_CONFIRMATION,
                            causes: []
                        }
                    }
                    : null
            ));

            const structure = await service.getStructure();

            expect(structure.cycles[0].status).toEqual(ExecutableStatus.WAITTING_CONFIRMATION);
            expect(structure.cycles[0].progression).toBeFalsy();
        });

        it('should rehydrate a sequence\'s status/progression from its last known event', async () => {
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const sequence = new SequenceModel();
            sequence.cycleId = cycle._id;
            sequence.name = 'Seq 1';
            sequence.status = ExecutableStatus.STOPPED;
            sequence.securityConfig = { maxDuration: 30 };
            sequence.moduleConfigs = [];
            const savedSequence = await sequenceMongooseRepository.create(sequence);
            const sequenceId = savedSequence._id;
            const startedAt = new Date('2026-07-30T10:00:00.000Z');
            eventRepository.getLast.mockImplementation((id: string) => Promise.resolve(
                id === sequenceId
                    ? {
                        elementId: id,
                        additionalData: { status: ExecutableStatus.IN_PROCCESS, value: ExecutableStatus.IN_PROCCESS, startedAt, duration: 30 }
                    }
                    : null
            ));

            await service.getStructure();

            expect(service.sequences[0].status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(service.sequences[0].progression).toEqual({ startedAt, duration: 30 });
            expect(eventRepository.getLast).toHaveBeenCalledWith(sequenceId);
        });

        it('should populate a sensor\'s value/date from its last known event, and reflect it in structure.values', async () => {
            const lastEventDate = new Date('2024-01-01T00:00:00.000Z');
            sensorRepository.get.mockResolvedValue([{ _id: 'sensor-1' }]);
            eventRepository.getLast.mockResolvedValue({ elementId: 'sensor-1', additionalData: { value: '42' }, date: lastEventDate });

            const structure = await service.getStructure();

            expect(structure.sensors[0].value).toEqual(42);
            expect(structure.sensors[0].date).toEqual(lastEventDate);
            expect(structure.values).toContainEqual({ id: 'sensor-1', value: 42, type: 'SENSOR', date: lastEventDate });
        });

        it('should leave structure.values empty when no sensor has a known reading yet', async () => {
            sensorRepository.get.mockResolvedValue([{ _id: 'sensor-1' }]);
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
            const sensor = Object.assign(new SensorModel(), { _id: 'sensor-1', value: 42, date: new Date('2024-01-01') });
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

        it('should include startedAt/duration from an executable\'s progression when present', async () => {
            const startedAt = new Date('2024-06-01T10:00:00Z');
            service.structure.cycles[0].progression = { startedAt, duration: 1500 };
            service.structure.cycles[0].sequences[0].progression = { startedAt, duration: 30 };

            const result = await service.getStatus('CYCLE') as ProcessValueModel[];
            const sequenceResult = await service.getStatus('SEQUENCE') as ProcessValueModel[];

            expect(result[0]).toMatchObject({ startedAt, duration: 1500 });
            expect(sequenceResult[0]).toMatchObject({ startedAt, duration: 30 });
        });
    });

    describe('buildSlaveFromTemplate / scanMaster', () => {
        const masterId = '8d6f3fe2-af41-405b-9523-a0a6fb589b42';
        const template: SlaveTemplate = {
            _id: '5b0c1f0e-3a3e-4c2a-9a51-2f6d1b7e8c01',
            name: '8/IO IRRIGATION VALVES',
            description: '8/IO IRRIGATION VALVES',
            type: DeviceRangeType.DIGITAL_IO,
            device: { name: '8/IO IRRIGATION VALVES', description: '8/IO IRRIGATION VALVES' },
            comRequests: [
                { name: 'digital output request', type: [ComRequestType.DIGITAL_OUTPUT], config: { address: 0, function: [ModbusFunctionName.WRITE_SINGLE_COIL] } },
                { name: 'SWITCH ALL ON', description: 'SWITCH ALL ON', type: [ComRequestType.DIGITAL_IO_INIT], config: { address: 255, function: [ModbusFunctionName.WRITE_SINGLE_COIL], done: true, params: { length: 1, value: 1 } } },
            ],
        };

        it('should build a slave attached to the master with linked comRequests', () => {
            const { device, comRequests } = service.buildSlaveFromTemplate(template, masterId);

            expect(isValidUuid(device._id)).toBe(true);
            expect(device).toMatchObject({ type: DeviceType.SLAVE, config: { slaveId: 1, masterDeviceId: masterId }, deletedAt: null });
            expect(comRequests).toHaveLength(2);
            comRequests.forEach((cr) => {
                expect(isValidUuid(cr._id)).toBe(true);
                expect(cr.deviceId).toBe(device._id);
            });
            expect(comRequests[1].config.params).toEqual({ length: 1, value: 1 });
            expect(comRequests[1].config).not.toBe(template.comRequests[1].config);
        });

        it('scanMaster should probe the first unit id of each range and readdress the new module', async () => {
            const master = { _id: masterId, type: DeviceType.MASTER, config: {} };
            deviceRepository.get.mockResolvedValue(master);
            const save = jest.fn().mockImplementation(async (m) => m);
            Object.assign(deviceRepository, { save, getSlavesByMasterId: jest.fn().mockResolvedValue([{ config: { slaveId: 62 } }]) });
            Object.assign(modbusTaskRepository, { save });
            const scanDiscoveryRegisters = jest.fn().mockResolvedValue([
                { unitId: 61, register: 0x4000, value: 61 },
                { unitId: 11, register: 0x0005, value: 95 },
            ]);
            const setSlaveAdress = jest.fn().mockResolvedValue(true);
            const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
            Object.assign(service, { modbusService: { scanDiscoveryRegisters, setSlaveAdress }, logger, _loadSlaveTemplates: () => [template] });

            const created = await service.scanMaster(masterId);

            const targets = scanDiscoveryRegisters.mock.calls[0][1] as { unitId: number; register: number }[];
            expect(targets).toHaveLength(9);
            expect(targets).toContainEqual({ unitId: 1, register: DiscoveryAddressRegister.INVERTER });
            expect(targets).toContainEqual({ unitId: 81, register: DiscoveryAddressRegister.ANALOG_INPUT });
            expect(setSlaveAdress).toHaveBeenCalledWith(master, 0x4000, 61, 63);
            expect(created).toHaveLength(1);
            expect(created[0].config).toEqual({ slaveId: 63, masterDeviceId: masterId });
            expect(logger.warn).toHaveBeenCalledTimes(1);
        });

        it('should throw when master is missing or not a MASTER', async () => {
            deviceRepository.get.mockResolvedValue(null);
            await expect(service.scanMaster(masterId)).rejects.toThrow();
            deviceRepository.get.mockResolvedValue({ _id: masterId, type: DeviceType.SLAVE });
            await expect(service.scanMaster(masterId)).rejects.toThrow();
        });
    });
});
