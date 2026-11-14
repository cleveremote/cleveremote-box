import ModbusRTU from 'modbus-serial';
import { CtrlActuatorStrategy } from '@process/domain/services/actuator-strategies/ctrl-actuator.strategy';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { ActuatorActionConfig, ActuatorModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { ControlLoopMode, ControlLoopModel } from '@process/domain/models/control-loop.model';

interface MockModbusClient {
    connectTCP: jest.Mock;
    connectRTUBuffered: jest.Mock;
    setID: jest.Mock;
    setTimeout: jest.Mock;
    writeRegister: jest.Mock;
    close: jest.Mock;
}

// CtrlActuatorStrategy ne gere plus lui-meme la connexion Modbus pour piloter la vanne (deplace
// vers DeviceCommandService.execute, cf. _writeOpening), mais _connectClient et
// _writeChannelOutput restent utilises par les outils de commissionnement
// (testSetDeviceAddress/testStepOutput) : 'modbus-serial' est mocke pour ne jamais toucher un
// port reel, y compris pour ces chemins de commissionnement.
const mockModbusClients: MockModbusClient[] = [];
function CreateMockClient(overrides: Partial<MockModbusClient> = {}): MockModbusClient {
    const client = {
        connectTCP: jest.fn().mockResolvedValue(undefined),
        connectRTUBuffered: jest.fn().mockResolvedValue(undefined),
        setID: jest.fn(),
        setTimeout: jest.fn(),
        writeRegister: jest.fn().mockResolvedValue({ address: 0, value: 0 }),
        close: jest.fn((cb?: () => void) => cb?.()),
        ...overrides
    };
    mockModbusClients.push(client);
    return client;
}
jest.mock('modbus-serial', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => CreateMockClient())
}));

function CreateMasterDeviceModel(overrides: Partial<MasterConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device._id = 'master-1';
    device.name = 'master';
    device.type = DeviceType.MASTER;
    const config = new MasterConfigModel();
    config.protocol = MasterProtocol.TCP;
    config.ipAddress = '192.0.2.1';
    config.port = 502;
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateSlaveDeviceModel(overrides: Partial<SlaveConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device._id = 'ao8ch-device';
    device.name = 'slave';
    device.type = DeviceType.SLAVE;
    const config = new SlaveConfigModel();
    config.slaveId = 3;
    config.masterDeviceId = 'master-1';
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateValveModel(overrides: Partial<CtrlActuatorConfigModel> = {}): ActuatorModel & { config: CtrlActuatorConfigModel } {
    const valve = new ActuatorModel();
    valve._id = 'valve-1';
    valve.name = 'valve';
    valve.type = ActuatorType.CTRL;
    valve.status = ModuleStatus.OFF;
    const config = new CtrlActuatorConfigModel();
    config.valveType = 'PROPORTIONAL';
    config.deviceId = 'ao8ch-device';
    config.channel = 1;
    config.actions = [{ commandId: 'ao8ch-outputs-set', channel: 0 }];
    config.minOpening = 0;
    config.maxOpening = 100;
    config.openingPercent = 0;
    config.fullStrokeMs = 1000;
    Object.assign(config, overrides);
    valve.config = config;
    return valve as ActuatorModel & { config: CtrlActuatorConfigModel };
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('CtrlActuatorStrategy (DeviceCommandService mocked)', () => {
    let deviceRepository: { get: jest.Mock };
    let deviceCommandService: { execute: jest.Mock; numberRange: jest.Mock; actionsOfType: jest.Mock; runActions: jest.Mock };
    // usages des commandes des actions de la vanne (par défaut : la commande set de la sortie AO)
    let commandTypes: Record<string, DeviceCommandType[]>;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let regulationService: { findLoop: jest.Mock; regulate: jest.Mock; follow: jest.Mock; stopFollow: jest.Mock };
    let strategy: CtrlActuatorStrategy;
    let masterDevice: DeviceModel;
    let slaveDevice: DeviceModel;

    beforeEach(() => {
        mockModbusClients.length = 0;
        masterDevice = CreateMasterDeviceModel();
        slaveDevice = CreateSlaveDeviceModel();
        deviceRepository = {
            get: jest.fn((id: string) => Promise.resolve(
                id === masterDevice._id ? masterDevice : id === slaveDevice._id ? slaveDevice : null
            ))
        };
        commandTypes = { 'ao8ch-outputs-set': [DeviceCommandType.SET] };
        deviceCommandService = {
            execute: jest.fn().mockResolvedValue({ isOk: true }),
            numberRange: jest.fn().mockResolvedValue({ min: 0, max: 10000 }),
            actionsOfType: jest.fn((actions: ActuatorActionConfig[], type: DeviceCommandType) => Promise.resolve(actions
                .filter((action) => commandTypes[action.commandId]?.includes(type))
                .map((action) => ({ action, command: { _id: action.commandId, types: commandTypes[action.commandId] } })))),
            runActions: jest.fn().mockResolvedValue([])
        };
        logger = CreateLoggerMock();
        regulationService = {
            findLoop: jest.fn().mockResolvedValue(null),
            regulate: jest.fn().mockResolvedValue(undefined),
            follow: jest.fn().mockResolvedValue(undefined),
            stopFollow: jest.fn()
        };
        strategy = new CtrlActuatorStrategy(
            deviceRepository as unknown as DeviceRepository,
            { refreshMasterAddress: jest.fn().mockResolvedValue(false) } as never,
            logger as never,
            deviceCommandService as never,
            regulationService as never
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should have the CTRL type', () => {
        expect(strategy.type).toEqual(ActuatorType.CTRL);
    });

    it('should run the init commands of its actions on init', async () => {
        const valve = CreateValveModel();

        await expect(strategy.init(valve)).resolves.toBeUndefined();
        expect(deviceCommandService.runActions).toHaveBeenCalledWith('ao8ch-device', valve.config.actions, DeviceCommandType.INIT);
    });

    describe('reset', () => {
        it('should run the reset commands of its actions when it has some', async () => {
            commandTypes['ao8ch-reset'] = [DeviceCommandType.RESET];
            const valve = CreateValveModel({ openingPercent: 60, actions: [{ commandId: 'ao8ch-outputs-set', channel: 0 }, { commandId: 'ao8ch-reset', channel: 0 }] });

            await strategy.reset(valve);

            expect(deviceCommandService.runActions).toHaveBeenCalledWith('ao8ch-device', valve.config.actions, DeviceCommandType.RESET);
            expect(deviceCommandService.execute).not.toHaveBeenCalled();
        });

        it('should fall back to the minimal opening (4mA) through the set command when it has no reset command', async () => {
            const valve = CreateValveModel({ openingPercent: 60 });

            await strategy.reset(valve);

            expect(deviceCommandService.runActions).not.toHaveBeenCalled();
            expect(deviceCommandService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ao8ch-outputs-set' }), 'ao8ch-device', { channel: 0, value: 0 });
            expect(valve.config.openingPercent).toEqual(0);
        });

        it('should stop a running follow', async () => {
            await strategy.reset(CreateValveModel());

            expect(regulationService.stopFollow).toHaveBeenCalledWith('valve-1');
        });
    });

    describe('set (control loop)', () => {
        function CreateLoop(mode: ControlLoopMode): ControlLoopModel {
            return Object.assign(new ControlLoopModel(), { _id: 'loop-1', actuatorId: 'valve-1', sensorId: 'pot-1', mode, setpoint: 10 });
        }

        it('should regulate on the loop setpoint in REGULATION mode', async () => {
            const valve = CreateValveModel();
            const loop = CreateLoop(ControlLoopMode.REGULATION);
            regulationService.findLoop.mockResolvedValue(loop);

            await strategy.set(valve, 1);

            expect(regulationService.regulate).toHaveBeenCalledWith(valve, loop, expect.objectContaining({ write: expect.any(Function) }));
            expect(regulationService.follow).not.toHaveBeenCalled();
        });

        it('should follow the loop sensor in FOLLOW mode, writing through position()', async () => {
            const valve = CreateValveModel();
            const loop = CreateLoop(ControlLoopMode.FOLLOW);
            regulationService.findLoop.mockResolvedValue(loop);

            await strategy.set(valve, 1);

            expect(regulationService.follow).toHaveBeenCalledWith(valve, loop, expect.objectContaining({ write: expect.any(Function) }));
            expect(regulationService.regulate).not.toHaveBeenCalled();
            await regulationService.follow.mock.calls[0][2].write(30);
            expect(deviceCommandService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ao8ch-outputs-set' }), 'ao8ch-device', { channel: 0, value: 3000 });
            expect(valve.config.openingPercent).toEqual(30);
        });

        it('should stop the follow and close the valve on OFF without looking up the loop', async () => {
            const valve = CreateValveModel({ openingPercent: 60 });

            await strategy.set(valve, 0);

            expect(regulationService.stopFollow).toHaveBeenCalledWith('valve-1');
            expect(regulationService.findLoop).not.toHaveBeenCalled();
            expect(valve.config.openingPercent).toEqual(0);
        });
    });

    describe('set (direct positioning, action = opening %)', () => {
        it('should write the opening scaled onto the template input range and keep it as openingPercent', async () => {
            const valve = CreateValveModel({ actions: [{ commandId: 'ao8ch-outputs-set', channel: 2 }] });

            await strategy.set(valve, 50);

            expect(deviceCommandService.numberRange).toHaveBeenCalledWith('ao8ch-outputs-set', 'ao8ch-device');
            expect(deviceCommandService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ao8ch-outputs-set' }), 'ao8ch-device', { channel: 2, value: 5000 });
            expect(valve.config.openingPercent).toEqual(50);
        });

        it('should clamp the opening to [minOpening, maxOpening]', async () => {
            const valve = CreateValveModel({ minOpening: 10, maxOpening: 80 });

            await strategy.set(valve, 120);

            expect(deviceCommandService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ao8ch-outputs-set' }), 'ao8ch-device', { channel: 0, value: 8000 });
            expect(valve.config.openingPercent).toEqual(80);
        });

        it('should only write through the set command of its actions', async () => {
            commandTypes['ao8ch-outputs-read'] = [DeviceCommandType.READ];
            const valve = CreateValveModel({ actions: [{ commandId: 'ao8ch-outputs-read', channel: 1 }, { commandId: 'ao8ch-outputs-set', channel: 2 }] });

            await strategy.set(valve, 100);

            expect(deviceCommandService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ao8ch-outputs-set' }), 'ao8ch-device', { channel: 2, value: 10000 });
            expect(deviceCommandService.execute).not.toHaveBeenCalledWith(expect.objectContaining({ _id: 'ao8ch-outputs-read' }), expect.anything(), expect.anything());
        });

        it('should reject when the valve has no set command', async () => {
            commandTypes = {};

            await expect(strategy.set(CreateValveModel(), 50)).rejects.toThrow('sans commande set');
            expect(deviceCommandService.execute).not.toHaveBeenCalled();
        });

        it('should reject when the DeviceCommand has no numeric input', async () => {
            deviceCommandService.numberRange.mockResolvedValue(undefined);

            await expect(strategy.set(CreateValveModel(), 50)).rejects.toThrow('sans saisie numérique');
            expect(deviceCommandService.execute).not.toHaveBeenCalled();
        });
    });

    describe('read', () => {
        it('should return the current openingPercent without any modbus I/O', async () => {
            const valve = CreateValveModel({ openingPercent: 42 });

            await expect(strategy.read(valve)).resolves.toEqual(42);
            expect(deviceCommandService.execute).not.toHaveBeenCalled();
        });
    });

    describe('positioningDelayMs', () => {
        it('should be proportional to the opening delta over the full stroke', () => {
            const valve = CreateValveModel({ minOpening: 0, maxOpening: 100, fullStrokeMs: 1000 });

            expect(strategy.positioningDelayMs(valve, -25)).toEqual(250);
        });

        it('should be 0 when the valve has no travel range', () => {
            expect(strategy.positioningDelayMs(CreateValveModel({ minOpening: 50, maxOpening: 50 }), 10)).toEqual(0);
        });
    });

    describe('testSetDeviceAddress (commissioning: broadcast slave address write)', () => {
        it('should write the broadcast address register, log, and close the connection on success', async () => {
            await strategy.testSetDeviceAddress('ao8ch-device', 7);

            expect(mockModbusClients[0].setID).toHaveBeenCalledWith(0);
            expect(mockModbusClients[0].writeRegister).toHaveBeenCalledWith(0x4000, 7);
            expect(logger.log).toHaveBeenCalledWith(
                expect.objectContaining({ deviceId: 'ao8ch-device', newAddress: 7 }),
                'waveshare AO8CH device address written (broadcast)'
            );
            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });

        it('should log the error, rethrow it, and still close the connection when the write fails', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockRejectedValue(new Error('boom'));
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));

            await expect(strategy.testSetDeviceAddress('ao8ch-device', 7)).rejects.toThrow('boom');

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ deviceId: 'ao8ch-device', newAddress: 7 }),
                'valve device address write error'
            );
            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });

        it('should reject when the slave device is not found', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(strategy.testSetDeviceAddress('unknown-device', 7)).rejects.toThrow('no slave device found for deviceId: unknown-device');
        });

        it('should reject when the master device is not found', async () => {
            deviceRepository.get.mockImplementation((id: string) => Promise.resolve(id === slaveDevice._id ? slaveDevice : null));

            await expect(strategy.testSetDeviceAddress('ao8ch-device', 7)).rejects.toThrow('No master device found for masterDeviceId: master-1');
        });

        it('should connect over RTU with the baudRate fallback (9600) when unset', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB2' });

            await strategy.testSetDeviceAddress('ao8ch-device', 7);

            expect(mockModbusClients[0].connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB2', { baudRate: 9600 });
        });

        it('should connect over RTU using the configured baudRate when set', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB2', baudRate: 19200 });

            await strategy.testSetDeviceAddress('ao8ch-device', 7);

            expect(mockModbusClients[0].connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB2', { baudRate: 19200 });
        });

        it('should reject for an unknown protocol', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: 'foo' });

            await expect(strategy.testSetDeviceAddress('ao8ch-device', 7)).rejects.toThrow('Unknown protocol: foo');
        });

        it('should use the configured timeout when set (default device fixture already covers the 2000ms fallback)', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.TCP, ipAddress: '10.0.0.1', port: 502, timeout: 5000 });

            await strategy.testSetDeviceAddress('ao8ch-device', 7);

            expect(mockModbusClients[0].setTimeout).toHaveBeenCalledWith(5000);
            // the first test in this describe used the default device fixture (no timeout set),
            // which already exercises the `masterConfig.timeout || 2000` fallback branch.
        });
    });

    describe('testStepOutput / _writeChannelOutput (commissioning: single channel output write)', () => {
        function MockDelay(): void {
            jest.spyOn(strategy as unknown as { _delay: (ms: number) => Promise<void> }, '_delay').mockResolvedValue(undefined);
        }

        it('should write a clamped 4mA output using the default step/delay parameters, falling back to the configured slaveId when no unit override is given', async () => {
            MockDelay();

            await strategy.testStepOutput('ao8ch-device', 2);

            expect(mockModbusClients[0].setID).toHaveBeenCalledWith(3);
            expect(mockModbusClients[0].writeRegister).toHaveBeenCalledWith(0x0001, 4000);
            expect(logger.log).toHaveBeenCalledWith(
                expect.objectContaining({ deviceId: 'ao8ch-device', channel: 2, milliAmps: 4, microAmps: 4000 }),
                'waveshare AO8CH channel output written'
            );
        });

        it('should accept explicit stepMa/stepDelayMs arguments without changing behavior (unused by the current body)', async () => {
            MockDelay();

            await strategy.testStepOutput('ao8ch-device', 1, 0.5, 50);

            expect(mockModbusClients[0].writeRegister).toHaveBeenCalledWith(0x0000, 4000);
        });

        it('should swallow the error and still close the connection when err.modbusCode is defined', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockRejectedValue(Object.assign(new Error('illegal address'), { modbusCode: 2 }));
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));
            MockDelay();

            await expect(strategy.testStepOutput('ao8ch-device', 1)).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'ao8ch-device', channel: 1 }), 'valve output write error');
            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });

        it('should swallow the error when err.code is a known network error code', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockRejectedValue(Object.assign(new Error('unreachable'), { code: 'ETIMEDOUT' }));
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));
            MockDelay();

            await expect(strategy.testStepOutput('ao8ch-device', 1)).resolves.toBeUndefined();
        });

        it('should rethrow an error whose code is neither modbusCode-flagged nor a known network code', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'SOMETHING_ELSE' }));
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));
            MockDelay();

            await expect(strategy.testStepOutput('ao8ch-device', 1)).rejects.toThrow('boom');

            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });
    });
});
