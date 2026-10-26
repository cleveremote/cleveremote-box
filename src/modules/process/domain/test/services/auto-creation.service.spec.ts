import { Connection } from 'mongoose';
import { AutoCreationService } from '@process/domain/services/slave-provisioning/auto-creation/auto-creation.service';
import { AutoCreationStrategyResolver } from '@process/domain/services/slave-provisioning/auto-creation/auto-creation-strategy.resolver';
import { SlaveBundlePersister } from '@process/domain/services/slave-provisioning/auto-creation/slave-bundle.persister';
import {
    DigitalIoAutoCreationStrategy
} from '@process/domain/services/slave-provisioning/auto-creation/strategies/digital-io-auto-creation.strategy';
import {
    SensorAutoCreationStrategy
} from '@process/domain/services/slave-provisioning/auto-creation/strategies/sensor-auto-creation.strategy';
import {
    DeviceOnlyAutoCreationStrategy
} from '@process/domain/services/slave-provisioning/auto-creation/strategies/device-only-auto-creation.strategy';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { CycleType } from '@process/domain/interfaces/executable.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { isValidUuid } from '@process/domain/utils/id.util';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import {
    CreateDeviceCommandServiceMock, CreateLoggerMock, DIGITAL_IO_TEMPLATE, MASTER_ID, TH_SENSOR_TEMPLATE, WithPorts
} from './slave-provisioning.spec-mock';

describe('AutoCreationService (integration mongodb-memory-server for cycles)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let cycleRepository: CycleRepository;
    let sequenceRepository: SequenceRepository;
    let deviceRepository: { save: jest.Mock; delete: jest.Mock };
    let actuatorRepository: { save: jest.Mock; delete: jest.Mock };
    let sensorRepository: { save: jest.Mock; delete: jest.Mock };
    let deviceCommandRepository: { getByModelId: jest.Mock };
    let deviceCommandService: ReturnType<typeof CreateDeviceCommandServiceMock>;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: AutoCreationService;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const sequenceMongooseRepository = new SequenceMongooseRepository(connection.model(Sequence.name, SequenceSchema) as never);
        sequenceRepository = new SequenceRepository(sequenceMongooseRepository);
        cycleRepository = new CycleRepository(
            new CycleMongooseRepository(
                connection.model(Cycle.name, CycleSchema) as never,
                sequenceMongooseRepository,
                new ScheduleMongooseRepository(connection.model(Schedule.name, ScheduleSchema) as never),
                new TriggerMongooseRepository(connection.model(Trigger.name, TriggerSchema) as never)
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

        deviceRepository = { save: jest.fn().mockImplementation(async (m) => m), delete: jest.fn().mockResolvedValue(true) };
        actuatorRepository = { save: jest.fn().mockImplementation(async (m) => m), delete: jest.fn().mockResolvedValue(true) };
        sensorRepository = { save: jest.fn().mockImplementation(async (m) => m), delete: jest.fn().mockResolvedValue(true) };
        deviceCommandRepository = { getByModelId: jest.fn().mockResolvedValue([]) };
        deviceCommandService = CreateDeviceCommandServiceMock();
        logger = CreateLoggerMock();
        service = CreateService(sequenceRepository);
    });

    function CreateService(sequences: SequenceRepository): AutoCreationService {
        const resolver = new AutoCreationStrategyResolver(
            [
                new DigitalIoAutoCreationStrategy(deviceCommandService as never, logger as never),
                new SensorAutoCreationStrategy(deviceCommandService as never, logger as never)
            ],
            new DeviceOnlyAutoCreationStrategy()
        );
        const persister = new SlaveBundlePersister(
            deviceRepository as never, actuatorRepository as never, cycleRepository, sequences, sensorRepository as never, logger as never
        );
        return new AutoCreationService(resolver, persister, deviceCommandRepository as never, deviceCommandService as never, logger as never);
    }

    describe('build', () => {
        it('should build a slave attached to the master and to the model, sharing its commands, no init applied yet', async () => {
            const { device, actuators, cycles } = await service.build(DIGITAL_IO_TEMPLATE, MASTER_ID);

            expect(isValidUuid(device._id)).toBe(true);
            expect(device).toMatchObject({
                type: DeviceType.SLAVE,
                config: {
                    slaveId: 1, masterDeviceId: MASTER_ID, kind: DeviceKind.DIGITAL_IO_8_CH, modelId: DIGITAL_IO_TEMPLATE._id, initDoneCommandIds: []
                },
                deletedAt: null
            });
            expect(actuators).toEqual([]);
            expect(cycles).toEqual([]);
        });

        it('should suffix the name when a slave already carries it', async () => {
            const existing = [
                { name: DIGITAL_IO_TEMPLATE.device.name, type: DeviceType.SLAVE },
                { name: `${DIGITAL_IO_TEMPLATE.device.name} 1`, type: DeviceType.SLAVE }
            ] as DeviceModel[];

            const { device } = await service.build(DIGITAL_IO_TEMPLATE, MASTER_ID, 62, existing);

            expect(device.name).toBe(`${DIGITAL_IO_TEMPLATE.device.name} 2`);
        });

        it('should create the slave alone for a kind without dedicated strategy', async () => {
            const template = WithPorts({ ...DIGITAL_IO_TEMPLATE, kind: DeviceKind.MODBUS_SLAVE }, 2);

            const { actuators, cycles } = await service.build(template, MASTER_ID);

            expect(actuators).toEqual([]);
            expect(cycles).toEqual([]);
        });
    });

    describe('createSlave', () => {
        it('should persist the MODULE cycles and their sequences of the created actuators', async () => {
            const template = WithPorts(DIGITAL_IO_TEMPLATE, 2);
            const commands = [{ _id: 'c1' }];
            deviceCommandRepository.getByModelId.mockResolvedValue(commands);

            const created = await service.createSlave(
                { template, kind: template.kind, slaveId: 63 }, MASTER_ID, { existingDevices: [], templates: [template] }
            );

            const actuators = actuatorRepository.save.mock.calls.map(([a]) => a);
            const cycles = await cycleRepository.get() as CycleModel[];
            expect(cycles).toHaveLength(2);
            expect(cycles.every((cycle) => cycle.type === CycleType.MODULE)).toBe(true);
            expect(cycles.map((cycle) => cycle.sequences[0].moduleConfigs[0].moduleId).sort())
                .toEqual(actuators.map((a) => a._id).sort());
            expect(created.config).toMatchObject({ slaveId: 63, masterDeviceId: MASTER_ID, modelId: template._id });
            expect(created.deviceCommands).toBe(commands);
            expect(deviceCommandService.withParams).toHaveBeenCalledWith(commands, [template]);
        });

        it('should roll back cycles, actuators and device when a sequence save fails', async () => {
            const template = WithPorts(DIGITAL_IO_TEMPLATE, 1);
            const cycleDelete = jest.spyOn(cycleRepository, 'delete').mockResolvedValue(true);
            service = CreateService({ save: jest.fn().mockRejectedValue(new Error('sequence save failed')) } as never);

            const scanned = { template, kind: template.kind, slaveId: 63 };
            await expect(service.createSlave(scanned, MASTER_ID, { existingDevices: [], templates: [template] }))
                .rejects.toThrow('sequence save failed');

            expect(cycleDelete).toHaveBeenCalledTimes(1);
            expect(actuatorRepository.delete).toHaveBeenCalledTimes(1);
            expect(deviceRepository.delete).toHaveBeenCalledTimes(1);
            cycleDelete.mockRestore();
        });

        it('should persist the sensors built from the autoCreate fields', async () => {
            const scanned = { template: TH_SENSOR_TEMPLATE, kind: TH_SENSOR_TEMPLATE.kind, slaveId: 63 };

            await service.createSlave(scanned, MASTER_ID, { existingDevices: [], templates: [TH_SENSOR_TEMPLATE] });

            const sensors = sensorRepository.save.mock.calls.map(([sensor]) => sensor);
            expect(sensors).toHaveLength(3);
            expect(sensors.slice(1).every((sensor) => sensor.parentId === sensors[0]._id)).toBe(true);
        });

        it('should roll back the saved sensors and the device when a sensor save fails', async () => {
            sensorRepository.save
                .mockImplementationOnce(async (m) => m)
                .mockRejectedValueOnce(new Error('sensor save failed'));
            const scanned = { template: TH_SENSOR_TEMPLATE, kind: TH_SENSOR_TEMPLATE.kind, slaveId: 63 };

            await expect(service.createSlave(scanned, MASTER_ID, { existingDevices: [], templates: [TH_SENSOR_TEMPLATE] }))
                .rejects.toThrow('sensor save failed');

            expect(sensorRepository.delete).toHaveBeenCalledTimes(2);
            expect(deviceRepository.delete).toHaveBeenCalledTimes(1);
        });
    });
});
