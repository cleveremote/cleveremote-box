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
import { CycleRunModel, RunOutcome } from '@process/domain/models/cycle-history.model';
import { EventPurgeSkipReason } from '@process/domain/models/event-purge.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ValueModel, ExecutableType } from '@process/domain/models/value.model';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateCycleModel } from './cycle.spec-mock';
import { DeviceKind, SlaveTemplate } from '@process/domain/models/device.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';

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
    let deviceCommandRepository: ReturnType<typeof CreateEmptyGetRepositoryMock>;
    let deviceCommandService: { withParams: jest.Mock };
    let slaveTemplateRepository: { get: jest.Mock };
    let slaveScanService: { scan: jest.Mock };
    let autoCreationService: { createSlave: jest.Mock };
    let actuatorRepository: ReturnType<typeof CreateEmptyGetRepositoryMock>;
    let eventRepository: {
        save: jest.Mock; getLast: jest.Mock; getLastStatus: jest.Mock; getByDeviceAndDateRange: jest.Mock;
        getByRunIds: jest.Mock; getRunIds: jest.Mock; getLatestByDevice: jest.Mock; purge: jest.Mock;
    };
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
        await connection.collection('sequences').deleteMany({});

        sensorRepository = CreateEmptyGetRepositoryMock();
        deviceRepository = CreateEmptyGetRepositoryMock();
        deviceCommandRepository = CreateEmptyGetRepositoryMock();
        deviceCommandService = { withParams: jest.fn((commands: unknown) => Promise.resolve(commands)) };
        actuatorRepository = CreateEmptyGetRepositoryMock();
        eventRepository = {
            save: jest.fn().mockResolvedValue(undefined),
            getLast: jest.fn().mockResolvedValue(null),
            getLastStatus: jest.fn().mockResolvedValue(null),
            getByDeviceAndDateRange: jest.fn().mockResolvedValue([]),
            getByRunIds: jest.fn().mockResolvedValue([]),
            getRunIds: jest.fn().mockResolvedValue([]),
            getLatestByDevice: jest.fn().mockResolvedValue([]),
            purge: jest.fn().mockResolvedValue(3)
        };

        slaveScanService = { scan: jest.fn() };
        autoCreationService = { createSlave: jest.fn() };
        slaveTemplateRepository = { get: jest.fn().mockResolvedValue([]) };

        service = new StructureService(
            cycleRepository,
            sensorRepository as never,
            deviceRepository as never,
            slaveTemplateRepository as never,
            eventRepository as never,
            actuatorRepository as never,
            deviceCommandService as never,
            slaveScanService as never,
            autoCreationService as never,
            { get: jest.fn().mockResolvedValue([]) } as never,
            { get: jest.fn().mockResolvedValue({}) } as never
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

        // passe car eventRepository.getLastStatus renvoie null par defaut (beforeEach) : aucun evenement
        // connu pour ce cycle, donc le defaut STOPPED du schema Mongo est conserve tel quel.
        it('should leave a freshly loaded cycle at its default STOPPED status when it has no known event', async () => {
            await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));

            const structure = await service.getStructure();

            expect(structure.cycles[0].status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should rehydrate a cycle\'s status/progression from its last known event (IN_PROCCESS)', async () => {
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const startedAt = new Date('2026-07-30T10:00:00.000Z');
            eventRepository.getLastStatus.mockImplementation((id: string) => Promise.resolve(
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
            expect(eventRepository.getLastStatus).toHaveBeenCalledWith(cycle._id);
        });

        it('should not set progression when the last known cycle event is STOPPED', async () => {
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            eventRepository.getLastStatus.mockImplementation((id: string) => Promise.resolve(
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
            eventRepository.getLastStatus.mockImplementation((id: string) => Promise.resolve(
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
            eventRepository.getLastStatus.mockImplementation((id: string) => Promise.resolve(
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
            expect(eventRepository.getLastStatus).toHaveBeenCalledWith(sequenceId);
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

        it('should attach its DeviceCommand and model to a COM sensor, and its parent\'s ones to a child sensor', async () => {
            const template = {
                _id: 'model-1', name: 'Débitmètre', description: 'RS485', kind: DeviceKind.FLOWMETER_V1, deviceCommands: []
            } as SlaveTemplate;
            const command = { _id: 'command-1', modelId: 'model-1', name: 'Lecture débit' };
            slaveTemplateRepository.get.mockResolvedValue([template]);
            deviceCommandRepository.get.mockResolvedValue([command]);
            sensorRepository.get.mockResolvedValue([
                { _id: 'parent', type: SensorType.COM, parentId: null, config: { commandId: 'command-1', deviceId: 'slave-1' } },
                { _id: 'child', type: SensorType.COM, parentId: 'parent', config: { field: 'flow' } },
                { _id: 'unknown', type: SensorType.COM, parentId: null, config: { commandId: 'missing' } },
                { _id: 'forcast', type: SensorType.FORCAST, config: { cronPattern: '0 0 * * *' } }
            ]);

            const structure = await service.getStructure();

            const expectedModel = { _id: 'model-1', name: 'Débitmètre', description: 'RS485', kind: DeviceKind.FLOWMETER_V1 };
            const [parent, child, unknown, forcast] = structure.sensors;
            expect(deviceCommandService.withParams).toHaveBeenCalledWith([command], [template]);
            expect(parent.deviceCommand).toEqual(command);
            expect(parent.model).toEqual(expectedModel);
            expect(child.deviceCommand).toEqual(command);
            expect(child.model).toEqual(expectedModel);
            expect(unknown.deviceCommand).toBeUndefined();
            expect(unknown.model).toBeUndefined();
            expect(forcast.deviceCommand).toBeUndefined();
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

        it('should return the last events of a sensor when no date range is given', async () => {
            await service.getEvents({ deviceId: 'device-1' });

            expect(eventRepository.getLatestByDevice).toHaveBeenCalledWith('device-1', 50);
        });

        it('should return the runs of a cycle, completed with the out-of-range events of those runs', async () => {
            service.structure = Object.assign(new StructureModel(), {
                cycles: [Object.assign(new CycleModel(), { _id: 'cycle-1', sequences: [{ _id: 'seq-1' }] })]
            });
            const started = { _id: 'e1', elementId: 'cycle-1', elementType: 'CYCLE', date: new Date('2023-12-31T23:50:00Z'),
                additionalData: { type: 'MANUAL', kind: 'CYCLE_STARTED', runId: 'run-1', name: 'Zone A' } };
            const ended = { _id: 'e2', elementId: 'cycle-1', elementType: 'CYCLE', date: new Date('2024-01-01T00:10:00Z'),
                additionalData: { type: 'MANUAL', kind: 'CYCLE_ENDED', runId: 'run-1', stop: { reason: 'COMPLETED' } } };
            eventRepository.getRunIds.mockResolvedValue(['run-1']);
            eventRepository.getByRunIds.mockResolvedValue([started, ended]);

            const runs = await service.getEvents({ deviceId: 'cycle-1', startDate: '2024-01-01', endDate: '2024-01-31' }) as CycleRunModel[];

            expect(eventRepository.getRunIds).toHaveBeenCalledWith({
                elementIds: ['cycle-1', 'seq-1'], startDate: new Date('2024-01-01'), endDate: new Date('2024-01-31'), limit: undefined
            });
            expect(eventRepository.getByRunIds).toHaveBeenCalledWith(['run-1']);
            expect(runs).toHaveLength(1);
            expect(runs[0]).toEqual(expect.objectContaining({
                runId: 'run-1', cycleId: 'cycle-1', name: 'Zone A', outcome: RunOutcome.ENDED, startedAt: started.date, stop: { reason: 'COMPLETED' }
            }));
            expect(runs[0].timeline.map((x) => x.kind)).toEqual(['CYCLE_STARTED', 'CYCLE_ENDED']);
        });

        it('should return the runs of all cycles in the date range when deviceId is absent', async () => {
            await service.getEvents({ startDate: '2024-01-01', endDate: '2024-01-31' });

            expect(eventRepository.getRunIds).toHaveBeenCalledWith({
                elementIds: undefined, startDate: new Date('2024-01-01'), endDate: new Date('2024-01-31'), limit: undefined
            });
        });

        it('should return the last runs of all cycles when no parameter is given', async () => {
            const started = { _id: 'e1', elementId: 'cycle-2', elementType: 'CYCLE', date: new Date('2024-01-01T00:00:00Z'),
                additionalData: { type: 'MANUAL', kind: 'CYCLE_STARTED', runId: 'run-2' } };
            eventRepository.getRunIds.mockResolvedValue(['run-2']);
            eventRepository.getByRunIds.mockResolvedValue([started]);

            const runs = await service.getEvents({}) as CycleRunModel[];

            expect(eventRepository.getRunIds).toHaveBeenCalledWith({ elementIds: undefined, limit: 50 });
            expect(eventRepository.getByRunIds).toHaveBeenCalledWith(['run-2']);
            expect(runs.map((x) => [x.runId, x.cycleId, x.outcome])).toEqual([['run-2', 'cycle-2', RunOutcome.RUNNING]]);
        });
    });

    describe('purgeEvents', () => {
        beforeEach(() => {
            service.structure = Object.assign(new StructureModel(), {
                cycles: [
                    Object.assign(new CycleModel(),
                        { _id: 'cycle-1', name: 'Zone A', status: ExecutableStatus.STOPPED, sequences: [{ _id: 'seq-1' }] }),
                    Object.assign(new CycleModel(),
                        { _id: 'cycle-2', name: 'Zone B', status: ExecutableStatus.IN_PROCCESS, sequences: [{ _id: 'seq-2' }] })
                ],
                sensors: [{ _id: 'sensor-1' }, { _id: 'sensor-2' }]
            });
            eventRepository.getLast.mockImplementation((id: string) => Promise.resolve({ _id: `last-${id}` }));
        });

        it('should purge a stopped cycle with its sequences', async () => {
            const result = await service.purgeEvents({ deviceId: 'cycle-1' });

            expect(eventRepository.purge).toHaveBeenCalledWith({ elementIds: ['cycle-1', 'seq-1'], keptIds: [], before: undefined });
            expect(result).toEqual({ deletedCount: 3, skipped: [] });
        });

        it('should not purge an active cycle', async () => {
            const result = await service.purgeEvents({ deviceId: 'cycle-2' });

            expect(eventRepository.purge).not.toHaveBeenCalled();
            expect(result).toEqual({
                deletedCount: 0, skipped: [{ elementId: 'cycle-2', name: 'Zone B', reason: EventPurgeSkipReason.ACTIVE_CYCLE }]
            });
        });

        it('should keep the last event of a purged sensor and honour the before date', async () => {
            await service.purgeEvents({ deviceId: 'sensor-1', before: '2026-01-01' });

            expect(eventRepository.purge).toHaveBeenCalledWith({
                elementIds: ['sensor-1'], keptIds: ['last-sensor-1'], before: new Date('2026-01-01')
            });
        });

        it('should purge everything but the active cycles and the last event of each sensor', async () => {
            const result = await service.purgeEvents({});

            expect(eventRepository.purge).toHaveBeenCalledWith({
                excludedElementIds: ['cycle-2', 'seq-2'], keptIds: ['last-sensor-1', 'last-sensor-2'], before: undefined
            });
            expect(result.skipped).toEqual([{ elementId: 'cycle-2', name: 'Zone B', reason: EventPurgeSkipReason.ACTIVE_CYCLE }]);
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

    describe('scanMaster', () => {
        const masterId = '8d6f3fe2-af41-405b-9523-a0a6fb589b42';
        const template = { _id: '5b0c1f0e-3a3e-4c2a-9a51-2f6d1b7e8c01', kind: DeviceKind.DIGITAL_IO_8_CH } as SlaveTemplate;

        it('should create each slave yielded by the scan, with the loaded templates and the known devices', async () => {
            const scanned = [{ template, kind: template.kind, slaveId: 62 }, { template, kind: template.kind, slaveId: 63 }];
            const devices = [{ _id: 'existing' }];
            service.structure = { devices } as StructureModel;
            slaveTemplateRepository.get.mockResolvedValue([template]);
            slaveScanService.scan.mockImplementation(async function* () { yield* scanned; });
            autoCreationService.createSlave.mockImplementation(async ({ slaveId }) => ({ _id: `slave-${slaveId}`, deviceCommands: [] }));

            const created = await service.scanMaster(masterId);

            expect(slaveScanService.scan).toHaveBeenCalledWith(masterId, [template]);
            expect(autoCreationService.createSlave).toHaveBeenCalledTimes(2);
            expect(autoCreationService.createSlave).toHaveBeenCalledWith(scanned[0], masterId, { existingDevices: devices, templates: [template] });
            expect(created.map((d) => d._id)).toEqual(['slave-62', 'slave-63']);
        });

        it('should stop the scan when a slave creation fails', async () => {
            service.structure = { devices: [] } as StructureModel;
            let isResumed = false;
            slaveScanService.scan.mockImplementation(async function* () {
                yield { template, kind: template.kind, slaveId: 62 };
                isResumed = true;
            });
            autoCreationService.createSlave.mockRejectedValue(new Error('save failed'));

            await expect(service.scanMaster(masterId)).rejects.toThrow('save failed');
            expect(isResumed).toBe(false);
        });
    });
});
