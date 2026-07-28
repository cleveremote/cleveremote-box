import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { SensorService } from '@process/domain/services/sensor.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName, SensorModel } from '@process/domain/models/sensor.model';
import { SensorStrategy } from '@process/domain/services/sensor-strategies/sensor-strategy.interface';

function CreateSensorModel(overrides: Partial<SensorModel> = {}): SensorModel {
    const sensor = new SensorModel();
    sensor._id = 'sensor-1';
    sensor.name = 'sensor';
    sensor.type = SensorType.FORCAST;
    const config = new ForcastSensorConfigModel();
    config.cronPattern = '*/30 * * * * *';
    config.forcastData = forcastDataName.TEMPERATURE_2M_MAX;
    sensor.config = config;
    return Object.assign(sensor, overrides);
}

function CreateComSensorModel(overrides: Partial<SensorModel> = {}): SensorModel {
    const sensor = new SensorModel();
    sensor._id = 'com-sensor-1';
    sensor.name = 'com sensor';
    sensor.type = SensorType.COM;
    sensor.config = new ComSensorConfigModel();
    sensor.config.cronPattern = '*/30 * * * * *';
    sensor.config.comRequestId = 'request-1';
    return Object.assign(sensor, overrides);
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('SensorService', () => {
    let schedulerRegistry: SchedulerRegistry;
    let configurationService: { structure: { sensors: SensorModel[] } };
    let triggerService: { onElementValueChanged: { next: jest.Mock } };
    let wsService: { sendMessage: jest.Mock };
    let sensorRepository: { get: jest.Mock; getChildren: jest.Mock };
    let forcastStrategy: SensorStrategy;
    let comStrategy: SensorStrategy;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: SensorService;

    beforeAll(async () => {
        const testingModule = await Test.createTestingModule({ imports: [ScheduleModule.forRoot()] }).compile();
        schedulerRegistry = testingModule.get(SchedulerRegistry);
    });

    afterAll(() => {
        for (const name of schedulerRegistry.getCronJobs().keys()) {
            schedulerRegistry.deleteCronJob(name);
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        configurationService = { structure: { sensors: [] } };
        triggerService = { onElementValueChanged: { next: jest.fn() } };
        wsService = { sendMessage: jest.fn().mockResolvedValue('ok') };
        sensorRepository = { get: jest.fn().mockResolvedValue([]), getChildren: jest.fn().mockResolvedValue([]) };
        forcastStrategy = { type: SensorType.FORCAST, read: jest.fn().mockResolvedValue([{ value: 25, isFormated: true, unit: '°C', name: 'sensor' }]) };
        comStrategy = { type: SensorType.COM, read: jest.fn().mockRejectedValue(new NotImplementedError('not implemented')) };
        logger = CreateLoggerMock();

        service = new SensorService(
            schedulerRegistry,
            configurationService as unknown as StructureService,
            triggerService as never,
            wsService as never,
            sensorRepository as never,
            [forcastStrategy, comStrategy],
            logger as never
        );
    });

    describe('emitReceivedData', () => {
        it('should broadcast the value locally and remotely and notify the trigger service', () => {
            const sensor = CreateSensorModel();

            service.emitReceivedData(sensor, 23.5);

            expect(wsService.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ pattern: 'agg/synchronize/sensor-value' }),
                true
            );
            expect(wsService.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ pattern: 'agg/synchronize/sensor-value' }),
                false
            );
            expect(triggerService.onElementValueChanged.next).toHaveBeenCalledWith(
                expect.objectContaining({ id: sensor._id, value: 23.5 })
            );
        });

        it('should stamp a tomorrow date for FORCAST sensors', () => {
            const sensor = CreateSensorModel({ type: SensorType.FORCAST });

            service.emitReceivedData(sensor, 18);

            expect(triggerService.onElementValueChanged.next).toHaveBeenCalledWith(
                expect.objectContaining({ value: 18, date: expect.any(Date) })
            );
        });

        it('should not stamp a date for COM sensors', () => {
            const sensor = CreateComSensorModel();

            service.emitReceivedData(sensor, 5);

            const emitted = triggerService.onElementValueChanged.next.mock.calls[0][0];
            expect(emitted).toEqual(expect.objectContaining({ value: 5 }));
            expect(emitted.date).toBeUndefined();
        });

        it('should mutate the canonical sensor instance held by StructureService, not just the one passed in', () => {
            // le `sensor` recu par emitReceivedData() peut etre une instance distincte de celle
            // tenue par structure.sensors (ex: restartAllScheduledSensors() ne passe pas par
            // structure.sensors) : c'est cette derniere que getDeviceValue()/l'API doivent voir.
            const structSensor = CreateSensorModel();
            configurationService.structure.sensors = [structSensor];
            const otherInstance = CreateSensorModel();

            service.emitReceivedData(otherInstance, 27);

            expect(structSensor.value).toEqual(27);
            expect(otherInstance.value).toBeUndefined();
        });

        it('should log warnings when sending the sync message fails locally and remotely', async () => {
            const sensor = CreateSensorModel();
            wsService.sendMessage
                .mockRejectedValueOnce(new Error('local down'))
                .mockRejectedValueOnce(new Error('remote down'));

            service.emitReceivedData(sensor, 23.5);
            await new Promise((resolve) => setImmediate(resolve));

            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'failed to send sensor value (local)');
            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'failed to send sensor value (remote)');
        });
    });

    describe('initScheduledSensor', () => {
        it('should register a sensor and schedule its cron job', async () => {
            const sensor = CreateSensorModel({ _id: 'cron-sensor' });

            const result = await service.initScheduledSensor(sensor);

            expect(result).toBe(sensor);
            expect(configurationService.structure.sensors).toContain(sensor);
            expect(schedulerRegistry.doesExist('cron', 'cron-sensor')).toBe(true);
            schedulerRegistry.getCronJob('cron-sensor').stop();
        });

        it('should replace an already-registered sensor at the same index instead of duplicating it', async () => {
            const sensor = CreateSensorModel({ _id: 'cron-sensor-idx' });
            await service.initScheduledSensor(sensor);

            const updated = CreateSensorModel({ _id: 'cron-sensor-idx', name: 'renamed' });
            await service.initScheduledSensor(updated);

            expect(configurationService.structure.sensors).toHaveLength(1);
            expect(configurationService.structure.sensors[0]).toBe(updated);
            schedulerRegistry.getCronJob('cron-sensor-idx').stop();
        });

        it('should replace an already-scheduled cron job for the same sensor id', async () => {
            const sensor = CreateSensorModel({ _id: 'cron-sensor-2' });
            await service.initScheduledSensor(sensor);
            const firstJob = schedulerRegistry.getCronJob('cron-sensor-2');

            await service.initScheduledSensor(sensor);

            expect(schedulerRegistry.getCronJob('cron-sensor-2')).not.toBe(firstJob);
            schedulerRegistry.getCronJob('cron-sensor-2').stop();
        });

        it('should silently ignore an invalid cron pattern instead of throwing', async () => {
            const sensor = CreateSensorModel({ _id: 'bad-cron-sensor' });
            (sensor.config as ForcastSensorConfigModel).cronPattern = 'not-a-cron-pattern';

            await expect(service.initScheduledSensor(sensor)).resolves.toBe(sensor);
        });

        it('should unregister the sensor and stop its cron job when isDeleted is true', async () => {
            const sensor = CreateSensorModel({ _id: 'cron-sensor-3' });
            await service.initScheduledSensor(sensor);

            const result = await service.initScheduledSensor(sensor, true);

            expect(result).toBe(sensor);
            expect(configurationService.structure.sensors).not.toContain(sensor);
            expect(schedulerRegistry.doesExist('cron', 'cron-sensor-3')).toBe(false);
        });

        it('should be a no-op deletion when the cron job never existed', async () => {
            const sensor = CreateSensorModel({ _id: 'never-scheduled' });

            await expect(service.initScheduledSensor(sensor, true)).resolves.toBe(sensor);
        });

        it('should not schedule a cron job when the sensor is created with isEnabled false', async () => {
            const sensor = CreateSensorModel({ _id: 'disabled-sensor', isEnabled: false });

            const result = await service.initScheduledSensor(sensor);

            expect(result).toBe(sensor);
            expect(configurationService.structure.sensors).toContain(sensor);
            expect(schedulerRegistry.doesExist('cron', 'disabled-sensor')).toBe(false);
        });

        it('should stop and remove the cron job when an active sensor is updated to isEnabled false', async () => {
            const sensor = CreateSensorModel({ _id: 'toggle-off-sensor' });
            await service.initScheduledSensor(sensor);
            expect(schedulerRegistry.doesExist('cron', 'toggle-off-sensor')).toBe(true);

            const disabled = CreateSensorModel({ _id: 'toggle-off-sensor', isEnabled: false });
            const result = await service.initScheduledSensor(disabled);

            expect(result).toBe(disabled);
            expect(schedulerRegistry.doesExist('cron', 'toggle-off-sensor')).toBe(false);
        });

        it('should reschedule the cron job when a disabled sensor is updated back to isEnabled true', async () => {
            const disabled = CreateSensorModel({ _id: 'toggle-on-sensor', isEnabled: false });
            await service.initScheduledSensor(disabled);
            expect(schedulerRegistry.doesExist('cron', 'toggle-on-sensor')).toBe(false);

            const enabled = CreateSensorModel({ _id: 'toggle-on-sensor', isEnabled: true });
            const result = await service.initScheduledSensor(enabled);

            expect(result).toBe(enabled);
            expect(schedulerRegistry.doesExist('cron', 'toggle-on-sensor')).toBe(true);
            schedulerRegistry.getCronJob('toggle-on-sensor').stop();
        });

        it('should not schedule a cron job for a child sensor (parentId set)', async () => {
            const sensor = CreateComSensorModel({ _id: 'child-sensor', parentId: 'parent-1' });

            const result = await service.initScheduledSensor(sensor);

            expect(result).toBe(sensor);
            expect(configurationService.structure.sensors).toContain(sensor);
            expect(schedulerRegistry.doesExist('cron', 'child-sensor')).toBe(false);
        });

        it('should call the FORCAST strategy and emit its value each time the scheduled tick fires', async () => {
            const sensor = CreateSensorModel({ _id: 'cron-sensor-4' });
            await service.initScheduledSensor(sensor);

            await schedulerRegistry.getCronJob('cron-sensor-4').fireOnTick();

            expect(forcastStrategy.read).toHaveBeenCalledWith(sensor);
            expect(triggerService.onElementValueChanged.next).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'cron-sensor-4', value: 25 })
            );
            schedulerRegistry.getCronJob('cron-sensor-4').stop();
        });

        it('should log and swallow a strategy read failure instead of throwing', async () => {
            const sensor = CreateComSensorModel({ _id: 'cron-sensor-5' });
            await service.initScheduledSensor(sensor);

            await schedulerRegistry.getCronJob('cron-sensor-5').fireOnTick();

            expect(comStrategy.read).toHaveBeenCalledWith(sensor);
            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ sensorId: 'cron-sensor-5' }), 'sensor read failed');
            expect(triggerService.onElementValueChanged.next).not.toHaveBeenCalled();
            schedulerRegistry.getCronJob('cron-sensor-5').stop();
        });

        it('should log and swallow a NotImplementedError when the sensor type has no registered strategy', async () => {
            const serviceWithoutComStrategy = new SensorService(
                schedulerRegistry,
                configurationService as unknown as StructureService,
                triggerService as never,
                wsService as never,
                sensorRepository as never,
                [forcastStrategy],
                logger as never
            );
            const sensor = CreateComSensorModel({ _id: 'unsupported-type-sensor' });
            await serviceWithoutComStrategy.initScheduledSensor(sensor);

            await schedulerRegistry.getCronJob('unsupported-type-sensor').fireOnTick();

            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ sensorId: 'unsupported-type-sensor' }), 'sensor read failed');
            schedulerRegistry.getCronJob('unsupported-type-sensor').stop();
        });

        it('should compute a scaled value from the parent read results for each child sensor', async () => {
            const sensor = CreateComSensorModel({ _id: 'cron-sensor-6' });
            const child = CreateComSensorModel({ _id: 'child-a', parentId: 'cron-sensor-6' });
            (child.config as ComSensorConfigModel).code = 0;
            (child.config as ComSensorConfigModel).scale = 2;
            sensorRepository.getChildren.mockResolvedValue([child]);
            comStrategy.read = jest.fn().mockResolvedValue([{ value: 10, isFormated: false, unit: '', name: 'req' }] as never);
            await service.initScheduledSensor(sensor);

            await schedulerRegistry.getCronJob('cron-sensor-6').fireOnTick();

            expect(triggerService.onElementValueChanged.next).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'child-a', value: 20 })
            );
            schedulerRegistry.getCronJob('cron-sensor-6').stop();
        });

        it('should default the child scale to 1 when not configured', async () => {
            const sensor = CreateComSensorModel({ _id: 'cron-sensor-7' });
            const child = CreateComSensorModel({ _id: 'child-b', parentId: 'cron-sensor-7' });
            (child.config as ComSensorConfigModel).code = 0;
            (child.config as ComSensorConfigModel).scale = undefined;
            sensorRepository.getChildren.mockResolvedValue([child]);
            comStrategy.read = jest.fn().mockResolvedValue([{ value: 10, isFormated: false, unit: '', name: 'req' }] as never);
            await service.initScheduledSensor(sensor);

            await schedulerRegistry.getCronJob('cron-sensor-7').fireOnTick();

            expect(triggerService.onElementValueChanged.next).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'child-b', value: 10 })
            );
            schedulerRegistry.getCronJob('cron-sensor-7').stop();
        });
    });

    describe('restartAllScheduledSensors', () => {
        it('should recreate a cron job for every persisted sensor regardless of type', async () => {
            const forcast = CreateSensorModel({ _id: 'restart-1' });
            const com = CreateComSensorModel({ _id: 'restart-2' });
            sensorRepository.get.mockResolvedValue([forcast, com]);

            await service.restartAllScheduledSensors();

            expect(schedulerRegistry.doesExist('cron', 'restart-1')).toBe(true);
            expect(schedulerRegistry.doesExist('cron', 'restart-2')).toBe(true);
            schedulerRegistry.getCronJob('restart-1').stop();
            schedulerRegistry.getCronJob('restart-2').stop();
        });

        it('should call the right strategy when a restarted job ticks', async () => {
            const sensor = CreateSensorModel({ _id: 'restart-3' });
            sensorRepository.get.mockResolvedValue([sensor]);
            await service.restartAllScheduledSensors();

            await schedulerRegistry.getCronJob('restart-3').fireOnTick();

            expect(forcastStrategy.read).toHaveBeenCalledWith(sensor);
            expect(triggerService.onElementValueChanged.next).toHaveBeenCalledWith(expect.objectContaining({ id: 'restart-3' }));
            schedulerRegistry.getCronJob('restart-3').stop();
        });
    });

    describe('initialize', () => {
        it('should resolve immediately', async () => {
            await expect(service.initialize()).resolves.toBeUndefined();
        });
    });
});
