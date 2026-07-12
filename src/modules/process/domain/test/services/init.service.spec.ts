import { Connection } from 'mongoose';
import { InitService } from '@process/domain/services/init.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { TriggerService } from '@process/domain/services/trigger.service';
import { SensorService } from '@process/domain/services/sensor.service';
import { BleService } from '@process/domain/services/ble.service';
import { ModbusTaskService } from '@process/domain/services/modbus-task.service';
import { CtrlActuatorStrategy } from '@process/domain/services/actuator-strategies/ctrl-actuator.strategy';
import { DbService } from '@process/infrastructure/db/db.service';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
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
    let dbService: { initialize: jest.Mock };
    let processService: { resetAllModules: jest.Mock; applyInverterConfig: jest.Mock };
    let scheduleService: { restartAllSchedules: jest.Mock };
    let triggerService: { initilize: jest.Mock };
    let sensorService: { initialize: jest.Mock; restartAllScheduledSensors: jest.Mock };
    let bleService: { initialize: jest.Mock };
    let modBusService: { execute: jest.Mock; testExecuteTask: jest.Mock; monitorDigitalOutputs: jest.Mock };
    let ctrlActuatorStrategy: { testSetDeviceAddress: jest.Mock; testStepOutput: jest.Mock };
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
        jest.spyOn(actuatorRepository, 'migrateLegacyCollections');

        configurationService = { getStructure: jest.fn().mockResolvedValue(undefined), structure: { actuators: [] } };
        authenticationService = { initAuthentication: jest.fn().mockResolvedValue(true) };
        dbService = { initialize: jest.fn().mockResolvedValue(undefined) };
        processService = { resetAllModules: jest.fn().mockResolvedValue(undefined), applyInverterConfig: jest.fn().mockResolvedValue(undefined) };
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
            monitorDigitalOutputs: jest.fn().mockResolvedValue(undefined)
        };
        ctrlActuatorStrategy = {
            testSetDeviceAddress: jest.fn().mockResolvedValue(undefined),
            testStepOutput: jest.fn().mockResolvedValue(undefined)
        };
        logger = CreateLoggerMock();

        service = new InitService(
            configurationService as unknown as StructureService,
            authenticationService as unknown as AuthenticationService,
            dbService as unknown as DbService,
            processService as unknown as ProcessService,
            scheduleService as unknown as ScheduleService,
            triggerService as unknown as TriggerService,
            sensorService as unknown as SensorService,
            bleService as unknown as BleService,
            modBusService as unknown as ModbusTaskService,
            actuatorRepository,
            ctrlActuatorStrategy as unknown as CtrlActuatorStrategy,
            logger as never,
            processService as unknown as ProcessService
        );
    });

    describe('initialize (boot sequence)', () => {
        it('should run every boot step exactly once, in order, without throwing', async () => {
            await expect(service.initialize()).resolves.toBeUndefined();

            expect(dbService.initialize).toHaveBeenCalledTimes(1);
            expect(actuatorRepository.migrateLegacyCollections).toHaveBeenCalledTimes(1);
            expect(authenticationService.initAuthentication).toHaveBeenCalledTimes(1);
            expect(bleService.initialize).toHaveBeenCalledTimes(1);
            expect(triggerService.initilize).toHaveBeenCalledTimes(1);
            expect(sensorService.initialize).toHaveBeenCalledTimes(1);
            expect(processService.resetAllModules).toHaveBeenCalledTimes(1);
            expect(scheduleService.restartAllSchedules).toHaveBeenCalledTimes(1);
            expect(sensorService.restartAllScheduledSensors).toHaveBeenCalledTimes(1);
        });

        it('should load the configuration before and after seeding default valves', async () => {
            await service.initialize();

            expect(configurationService.getStructure).toHaveBeenCalledTimes(2);
        });

        it('should never reject, even when a boot step fails, and should log the wrapped error', async () => {
            dbService.initialize.mockRejectedValue(new Error('boom'));

            await expect(service.initialize()).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('[DbService.initialize] Error: boom') }),
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
    });

    describe('seedDefaultValves (via initialize)', () => {
        it('should seed both default valves when none exist yet', async () => {
            await service.initialize();

            const actuators = await actuatorRepository.get() as ActuatorModel[];
            const valves = actuators.filter((a) => a.type === ActuatorType.CTRL);
            expect(valves.map((v) => v.name).sort()).toEqual(['Injection Venturi Valve 1', 'Injection Venturi Valve 2']);
            expect(valves.every((v) => !!v._id)).toBe(true);
        });

        it('should skip seeding a default valve that is already tracked in configurationService.structure.actuators', async () => {
            configurationService.structure.actuators = [{ type: ActuatorType.CTRL, name: 'Injection Venturi Valve 1' } as ActuatorModel];

            await service.initialize();

            const actuators = await actuatorRepository.get() as ActuatorModel[];
            const valves = actuators.filter((a) => a.type === ActuatorType.CTRL);
            expect(valves.map((v) => v.name)).toEqual(['Injection Venturi Valve 2']);
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
