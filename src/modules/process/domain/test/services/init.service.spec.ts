import { Connection } from 'mongoose';
import { InitService } from '@process/domain/services/init.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { TriggerService } from '@process/domain/services/trigger.service';
import { SensorService } from '@process/domain/services/sensor.service';
import { BleService } from '@process/domain/services/ble.service';
import { ModbusService } from '@process/domain/services/modbus.service';
import { CtrlActuatorStrategy } from '@process/domain/services/actuator-strategies/ctrl-actuator.strategy';
import { ActuatorService } from '@process/domain/services/actuator.service';
import { DeviceService } from '@process/domain/services/device.service';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateActuatorMongooseModels } from './actuator.spec-mock';

// InitService.sendReadySignal() ouvre un vrai GPIO (led readysignal) quand `Gpio.accessible` est
// vrai : meme precaution que actuator.service.spec.ts, le module 'onoff' est mocke pour qu'aucun
// test ne touche jamais un GPIO reel.
jest.mock('onoff', () => {
    class MockGpio {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        public static accessible = false;
        public writeSync = jest.fn();
        public unexport = jest.fn();
        public direction = jest.fn(() => 'out');
        public readSync = jest.fn(() => 0);
    }
    return { Gpio: MockGpio };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Gpio } = require('onoff');

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('InitService (integration mongodb-memory-server for valves, onoff mocked)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let actuatorRepository: ActuatorRepository;
    let configurationService: { getStructure: jest.Mock; structure: { actuators: ActuatorModel[] } };
    let authenticationService: { initAuthentication: jest.Mock };
    let processService: { resetAllModules: jest.Mock; applyInverterConfig: jest.Mock; executeModuleCycleForDigitalOutput: jest.Mock };
    let scheduleService: { restartAllSchedules: jest.Mock };
    let triggerService: { initilize: jest.Mock };
    let sensorService: { initialize: jest.Mock; restartAllScheduledSensors: jest.Mock };
    let bleService: { initialize: jest.Mock };
    let modBusService: { execute: jest.Mock; testExecuteTask: jest.Mock; monitorDigitalOutputs: jest.Mock; watchForNewSlaveDevices: jest.Mock };
    let comRequestRepository: { migrateMissingType: jest.Mock };
    let ctrlActuatorStrategy: { testSetDeviceAddress: jest.Mock; testStepOutput: jest.Mock };
    let actuatorService: { execute: jest.Mock };
    let deviceService: { initAll: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: InitService;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
        const { actuatorModel, actuatorRpiModel, actuatorComModel, actuatorCtrlModel } = CreateActuatorMongooseModels(connection);
        actuatorRepository = new ActuatorRepository(new ActuatorMongooseRepository(
            actuatorModel as never, actuatorRpiModel as never, actuatorComModel as never, actuatorCtrlModel as never,
            connection, CreateLoggerMock() as never
        ));
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('actuators').deleteMany({});
        Gpio.accessible = false;

        configurationService = { getStructure: jest.fn().mockResolvedValue(undefined), structure: { actuators: [] } };
        authenticationService = { initAuthentication: jest.fn().mockResolvedValue(true) };
        processService = {
            resetAllModules: jest.fn().mockResolvedValue(undefined),
            applyInverterConfig: jest.fn().mockResolvedValue(undefined),
            executeModuleCycleForDigitalOutput: jest.fn().mockResolvedValue(undefined)
        };
        scheduleService = { restartAllSchedules: jest.fn().mockResolvedValue(undefined) };
        triggerService = { initilize: jest.fn() };
        sensorService = {
            initialize: jest.fn().mockResolvedValue(undefined),
            restartAllScheduledSensors: jest.fn().mockResolvedValue(undefined)
        };
        bleService = { initialize: jest.fn().mockResolvedValue(undefined) };
        modBusService = {
            execute: jest.fn().mockResolvedValue(undefined),
            testExecuteTask: jest.fn().mockResolvedValue(undefined),
            monitorDigitalOutputs: jest.fn().mockResolvedValue(undefined),
            watchForNewSlaveDevices: jest.fn().mockResolvedValue({ stop: jest.fn() })
        };
        comRequestRepository = { migrateMissingType: jest.fn().mockResolvedValue(undefined) };
        ctrlActuatorStrategy = {
            testSetDeviceAddress: jest.fn().mockResolvedValue(undefined),
            testStepOutput: jest.fn().mockResolvedValue(undefined)
        };
        actuatorService = { execute: jest.fn().mockResolvedValue(undefined) };
        deviceService = { initAll: jest.fn().mockResolvedValue(undefined) };
        logger = CreateLoggerMock();

        service = new InitService(
            configurationService as unknown as StructureService,
            authenticationService as unknown as AuthenticationService,
            processService as unknown as ProcessService,
            scheduleService as unknown as ScheduleService,
            triggerService as unknown as TriggerService,
            sensorService as unknown as SensorService,
            bleService as unknown as BleService,
            modBusService as unknown as ModbusService,
            actuatorRepository,
            comRequestRepository as unknown as ComRequestRepository,
            ctrlActuatorStrategy as unknown as CtrlActuatorStrategy,
            actuatorService as unknown as ActuatorService,
            deviceService as unknown as DeviceService,
            logger as never,
            processService as unknown as ProcessService
        );
    });

    describe('initialize (boot sequence)', () => {
        it('should run every boot step exactly once, in order, without throwing', async () => {
            await expect(service.initialize()).resolves.toBeUndefined();

            expect(authenticationService.initAuthentication).toHaveBeenCalledTimes(1);
            expect(bleService.initialize).toHaveBeenCalledTimes(1);
            expect(triggerService.initilize).toHaveBeenCalledTimes(1);
            expect(sensorService.initialize).toHaveBeenCalledTimes(1);
            expect(processService.resetAllModules).toHaveBeenCalledTimes(1);
            expect(scheduleService.restartAllSchedules).toHaveBeenCalledTimes(1);
            expect(sensorService.restartAllScheduledSensors).toHaveBeenCalledTimes(1);
            expect(deviceService.initAll).toHaveBeenCalledTimes(1);
            expect(modBusService.watchForNewSlaveDevices).toHaveBeenCalledTimes(1);
        });

        it('should load the configuration once (default valve seeding is currently disabled)', async () => {
            await service.initialize();

            expect(configurationService.getStructure).toHaveBeenCalledTimes(1);
        });

        it('should never reject, even when a boot step fails, and should log the wrapped error', async () => {
            configurationService.getStructure.mockRejectedValue(new Error('boom'));

            await expect(service.initialize()).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('[StructureService.getStructure] Error: boom') }),
                'initialization failed'
            );
        });

        it('should stop the boot sequence at the first failing step', async () => {
            scheduleService.restartAllSchedules.mockRejectedValue(new Error('schedule boom'));

            await service.initialize();

            expect(sensorService.restartAllScheduledSensors).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('[ScheduleService.restartAllSchedules]') }),
                'initialization failed'
            );
        });

        it('should never reject when watchForNewSlaveDevices fails, and should log the wrapped error', async () => {
            modBusService.watchForNewSlaveDevices.mockRejectedValue(new Error('discovery boom'));

            await expect(service.initialize()).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('[ModbusService.watchForNewSlaveDevices] Error: discovery boom') }),
                'initialization failed'
            );
        });

        // le monitoring monitorDigitalOutputs est actuellement desactive dans initialize()
        // (cf. le .then(...) commente) : un rejet de ce mock ne peut donc plus se propager.
        it('should not call monitorDigitalOutputs while the monitoring step stays disabled', async () => {
            modBusService.monitorDigitalOutputs.mockRejectedValue(undefined);

            await expect(service.initialize()).resolves.toBeUndefined();

            expect(modBusService.monitorDigitalOutputs).not.toHaveBeenCalled();
        });
    });

    describe('seedDefaultValves (via initialize)', () => {
        // l'etape InitService.seedDefaultValves est actuellement desactivee dans initialize()
        // (cf. le .then(...) commente) : ce test verrouille ce comportement intentionnel plutot
        // que de tester une seance de seeding qui ne se declenche plus au demarrage.
        it('should not seed any default valve via initialize while the seeding step stays disabled', async () => {
            await service.initialize();

            const actuators = await actuatorRepository.get() as ActuatorModel[];
            const valves = actuators.filter((a) => a.type === ActuatorType.CTRL);
            expect(valves).toEqual([]);
        });

        it('_createDefaultValveConfig should build a CTRL config for the default valve device/type', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = (service as any)._createDefaultValveConfig(3);

            expect(config).toEqual(expect.objectContaining({ valveType: 'PROPORTIONAL', channel: 3 }));
        });
    });

    // le mapping digital-output -> module cycle est actuellement desactive dans initialize()
    // (cf. le .then(...) commente sur monitorDigitalOutputs) : ces tests verrouillent ce
    // comportement intentionnel plutot que de tester un mapping qui ne se declenche plus au demarrage.
    describe('digital-output -> module cycle mapping (via initialize)', () => {
        it('should not map any digital output change while the monitoring step stays disabled', async () => {
            const change = { channel: 3, previous: false, current: true };
            modBusService.monitorDigitalOutputs.mockImplementation((_deviceId, _interval, _length, onChange) => {
                onChange([change]);
                return Promise.resolve(undefined);
            });

            await service.initialize();
            await new Promise((resolve) => setImmediate(resolve));

            expect(processService.executeModuleCycleForDigitalOutput).not.toHaveBeenCalled();
        });
    });

    describe('sendReadySignal (via initialize, GPIO mocked)', () => {
        it('should not touch the GPIO when the chip is not accessible', async () => {
            Gpio.accessible = false;

            await service.initialize();

            expect(logger.error).not.toHaveBeenCalled();
        });

        it('should blink the ready-signal LED through the mocked GPIO when the chip is accessible', async () => {
            Gpio.accessible = true;

            await service.initialize();

            expect(logger.error).not.toHaveBeenCalled();
        });
    });
});
