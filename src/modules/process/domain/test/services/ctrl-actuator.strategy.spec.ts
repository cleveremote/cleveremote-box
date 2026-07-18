import ModbusRTU from 'modbus-serial';
import { CtrlActuatorStrategy } from '@process/domain/services/actuator-strategies/ctrl-actuator.strategy';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ModbusService } from '@process/domain/services/modbus.service';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ActuatorModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';

interface MockModbusClient {
    connectTCP: jest.Mock;
    connectRTUBuffered: jest.Mock;
    setID: jest.Mock;
    setTimeout: jest.Mock;
    writeRegister: jest.Mock;
    close: jest.Mock;
}

// CtrlActuatorStrategy ne gere plus lui-meme la connexion Modbus pour piloter la vanne (deplace
// vers ModbusTaskService.execute, cf. _writeOpeningViaComRequest), mais _connectClient et
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
    config.slaveId = '3';
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
    config.actions = [{ comRequestId: 'ao8ch-write-channel', portNumber: 0 }];
    config.flowMeterId = 'flow-meter-1';
    config.maxFlowRate = 100;
    config.kP = 0.5;
    config.minOpening = 0;
    config.maxOpening = 100;
    config.openingPercent = 0;
    config.tolerance = 1;
    config.maxIterations = 15;
    config.iterationDelayMs = 1;
    config.fullStrokeMs = 1;
    Object.assign(config, overrides);
    valve.config = config;
    return valve as ActuatorModel & { config: CtrlActuatorConfigModel };
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function CreateComRequestModel(): ComRequestModel {
    return Object.assign(new ComRequestModel(), {
        _id: 'ao8ch-write-channel',
        config: { address: 0, function: [], params: { value: 0 } }
    });
}

describe('CtrlActuatorStrategy (ModbusTaskService mocked)', () => {
    let deviceRepository: { get: jest.Mock };
    let comRequestRepository: { get: jest.Mock };
    let modBusService: { execute: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let strategy: CtrlActuatorStrategy;
    let masterDevice: DeviceModel;
    let slaveDevice: DeviceModel;

    beforeEach(() => {
        // measurementNoise = (Math.random() - 0.5) * 2 : figé à 0 pour rendre la boucle de
        // régulation (fake flow meter) déterministe d'un run à l'autre.
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        mockModbusClients.length = 0;
        masterDevice = CreateMasterDeviceModel();
        slaveDevice = CreateSlaveDeviceModel();
        deviceRepository = {
            get: jest.fn((id: string) => Promise.resolve(
                id === masterDevice._id ? masterDevice : id === slaveDevice._id ? slaveDevice : null
            ))
        };
        comRequestRepository = { get: jest.fn().mockResolvedValue(CreateComRequestModel()) };
        modBusService = { execute: jest.fn().mockResolvedValue(undefined) };
        logger = CreateLoggerMock();
        strategy = new CtrlActuatorStrategy(
            deviceRepository as unknown as DeviceRepository,
            comRequestRepository as unknown as ComRequestRepository,
            modBusService as unknown as ModbusService,
            logger as never
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should have the CTRL type', () => {
        expect(strategy.type).toEqual(ActuatorType.CTRL);
    });

    it('should resolve without doing anything on configure', async () => {
        const valve = CreateValveModel();

        await expect(strategy.configure(valve)).resolves.toBeUndefined();
    });

    describe('execute (ActuatorStrategy entry point)', () => {
        it('should treat action as the target flow rate and delegate to setFlowRate', async () => {
            const valve = CreateValveModel({ minOpening: 100, maxOpening: 100 });

            await strategy.execute(valve, 50);

            expect(modBusService.execute).toHaveBeenCalledWith(
                expect.objectContaining({ _id: 'ao8ch-write-channel' }),
                expect.objectContaining({ address: 0, params: expect.objectContaining({ value: 20000 }) })
            );
        });
    });

    describe('read', () => {
        it('should return the current openingPercent without any modbus I/O', () => {
            const valve = CreateValveModel({ openingPercent: 42 });

            expect(strategy.read(valve)).toEqual(42);
            expect(modBusService.execute).not.toHaveBeenCalled();
        });
    });

    describe('setFlowRate (regulation loop)', () => {
        it('should converge within tolerance before reaching maxIterations', async () => {
            const valve = CreateValveModel();

            const result = await strategy.setFlowRate(valve, 50);

            expect(result.isStabilized).toBe(true);
            expect(result.iterations).toBeLessThan(valve.config.maxIterations);
            expect(Math.abs(result.targetFlowRate - result.measuredFlowRate)).toBeLessThanOrEqual(valve.config.tolerance);
        });

        it('should skip the modbus write on the final stabilized iteration', async () => {
            const valve = CreateValveModel();

            const result = await strategy.setFlowRate(valve, 50);

            expect(modBusService.execute).toHaveBeenCalledTimes(result.iterations - 1);
        });

        // _readFlowMeterTest est un débitmètre simulé (ramp iteration*10) en attendant le
        // branchement du vrai capteur RS485 : il converge donc vers la cible indépendamment de la
        // position physique de la vanne, y compris quand celle-ci est bloquée (minOpening=maxOpening).
        // Ce test ne peut donc pas exercer le cas "cible inatteignable" tant que _readFlowMeter
        // (le vrai capteur) n'est pas branché à la place.
        it('should stabilize from the fake flow meter ramp regardless of the valve being physically stuck', async () => {
            const valve = CreateValveModel({ minOpening: 0, maxOpening: 0 });

            const result = await strategy.setFlowRate(valve, 50);

            expect(result.isStabilized).toBe(true);
            expect(result.iterations).toBeLessThan(valve.config.maxIterations);
        });

        it('should clamp the output current to the 4-20mA live-zero range at the extremes', async () => {
            const closedValve = CreateValveModel({ minOpening: 0, maxOpening: 0 });
            const openValve = CreateValveModel({ minOpening: 100, maxOpening: 100 });

            const closedResult = await strategy.setFlowRate(closedValve, 50);
            const openResult = await strategy.setFlowRate(openValve, 50);

            expect(closedResult.outputCurrentMa).toEqual(4);
            expect(openResult.outputCurrentMa).toEqual(20);
        });

        it('should call ModbusTaskService.execute with the action comRequestId/digitalPort and the microamps equivalent of the opening', async () => {
            const valve = CreateValveModel({
                minOpening: 100, maxOpening: 100, channel: 3,
                actions: [{ comRequestId: 'ao8ch-write-channel', portNumber: 2 }]
            });

            await strategy.setFlowRate(valve, 50);

            expect(modBusService.execute).toHaveBeenCalledWith(
                expect.objectContaining({ _id: 'ao8ch-write-channel' }),
                expect.objectContaining({ address: 2, params: expect.objectContaining({ value: 20000 }) })
            );
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

    // _readFlowMeter n'est appele nulle part en production (_adjustOnce utilise toujours
    // _readFlowMeterTest, le debitmetre simule deterministe) : ce test verrouille seulement le
    // comportement de ce code mort en attendant sa suppression ou le branchement du vrai capteur.
    describe('_readFlowMeter (dead code - _adjustOnce always uses _readFlowMeterTest instead)', () => {
        it('should compute a noisy theoretical flow rate floored at 0', async () => {
            const valve = CreateValveModel({ openingPercent: 50, maxFlowRate: 100 });

            const result = await (strategy as unknown as { _readFlowMeter: (v: unknown) => Promise<number> })._readFlowMeter(valve);

            // measurementNoise = (Math.random() - 0.5) * 2, and Math.random is mocked to 0.5 => noise = 0
            expect(result).toEqual(50);
        });
    });
});
