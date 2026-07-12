import { Connection } from 'mongoose';
import ModbusRTU from 'modbus-serial';
import { CtrlActuatorStrategy } from '@process/domain/services/actuator-strategies/ctrl-actuator.strategy';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceMongooseRepository } from '@process/infrastructure/repositories/device-mongoose.repository';
import { Device, DeviceSchema } from '@process/infrastructure/schemas/device.schema';
import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { ActuatorModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';

interface MockModbusClient {
    connectTCP: jest.Mock;
    connectRTUBuffered: jest.Mock;
    setID: jest.Mock;
    setTimeout: jest.Mock;
    writeRegister: jest.Mock;
    close: jest.Mock;
}

// CtrlActuatorStrategy pilote une vraie boucle 4-20mA sur un module Modbus physique
// (cf. commentaires du service) : on mocke tout le module 'modbus-serial' pour qu'aucun test
// n'ouvre jamais un vrai port serie/TCP ni n'ecrive sur un actionneur reel.
const mockModbusClients: MockModbusClient[] = [];
jest.mock('modbus-serial', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
        const client = {
            connectTCP: jest.fn().mockResolvedValue(undefined),
            connectRTUBuffered: jest.fn().mockResolvedValue(undefined),
            setID: jest.fn(),
            setTimeout: jest.fn(),
            writeRegister: jest.fn().mockResolvedValue({ address: 0, value: 0 }),
            close: jest.fn((cb?: () => void) => cb?.())
        };
        mockModbusClients.push(client);
        return client;
    })
}));

function CreateMasterDeviceModel(overrides: Partial<MasterConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device.name = 'master';
    device.type = DeviceType.MASTER;
    const config = new MasterConfigModel();
    config.protocol = MasterProtocol.TCP;
    config.ipAddress = '192.0.2.1';
    config.port = 502;
    config.path = '/dev/ttyUSB0';
    config.timeout = 2000;
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateSlaveDeviceModel(masterDeviceId: string, overrides: Partial<SlaveConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device.name = 'slave';
    device.type = DeviceType.SLAVE;
    const config = new SlaveConfigModel();
    config.slaveId = '1';
    config.masterDeviceId = masterDeviceId;
    device.config = Object.assign(config, overrides);
    return device;
}

// Cree la paire MASTER (liaison physique) + SLAVE (adresse esclave, reference le MASTER via
// config.masterDeviceId) : valve.config.deviceId pointe desormais vers le SLAVE, resolu en
// deux sauts par CtrlActuatorStrategy._connectClient.
async function CreateSlaveDevice(deviceRepository: DeviceRepository, overrides: Partial<MasterConfigModel> = {}): Promise<DeviceModel> {
    const master = await deviceRepository.save(CreateMasterDeviceModel(overrides));
    return deviceRepository.save(CreateSlaveDeviceModel(master._id));
}

function CreateValveModel(deviceId: string, overrides: Partial<CtrlActuatorConfigModel> = {}): ActuatorModel & { config: CtrlActuatorConfigModel } {
    const valve = new ActuatorModel();
    valve._id = 'valve-1';
    valve.name = 'valve';
    valve.type = ActuatorType.CTRL;
    valve.status = ModuleStatus.OFF;
    // Construit la config sur une variable typee explicitement : ComActuatorConfigModel n'a
    // desormais plus qu'un `deviceId`, ce qui en fait un sous-ensemble structurel de
    // CtrlActuatorConfigModel. TS ne peut alors plus retrecir `valve.config` (union) au seul
    // type Ctrl lors d'ecritures successives sur cette propriete.
    const config = new CtrlActuatorConfigModel();
    config.valveType = 'PROPORTIONAL';
    config.deviceId = deviceId;
    config.channel = 1;
    config.flowMeterId = 'flow-meter-1';
    config.maxFlowRate = 100;
    config.kP = 0.5;
    config.minOpening = 0;
    config.maxOpening = 100;
    config.openingPercent = 0;
    config.tolerance = 1;
    config.maxIterations = 15;
    config.iterationDelayMs = 1;
    Object.assign(config, overrides);
    valve.config = config;
    return valve as ActuatorModel & { config: CtrlActuatorConfigModel };
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('CtrlActuatorStrategy (integration mongodb-memory-server, modbus-serial mocked)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let deviceRepository: DeviceRepository;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let strategy: CtrlActuatorStrategy;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
        const deviceModel = connection.model(Device.name, DeviceSchema);
        deviceRepository = new DeviceRepository(new DeviceMongooseRepository(deviceModel as never));
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('devices').deleteMany({});
        mockModbusClients.length = 0;
        // measurementNoise = (Math.random() - 0.5) * 2 : figé à 0 pour rendre la boucle de
        // régulation (fake flow meter) déterministe d'un run à l'autre.
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        logger = CreateLoggerMock();
        strategy = new CtrlActuatorStrategy(deviceRepository, logger as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should have the CTRL type', () => {
        expect(strategy.type).toEqual(ActuatorType.CTRL);
    });

    describe('execute (ActuatorStrategy entry point)', () => {
        it('should treat action as the target flow rate and delegate to setFlowRate', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });

            await strategy.execute(valve, 50);

            expect(mockModbusClients[0].writeRegister).toHaveBeenCalledWith(0, 20000);
        });
    });

    describe('read', () => {
        it('should return the current openingPercent without any modbus I/O', () => {
            const valve = CreateValveModel('unused-device-id', { openingPercent: 42 });

            expect(strategy.read(valve)).toEqual(42);
            expect(mockModbusClients.length).toEqual(0);
        });
    });

    describe('setFlowRate (regulation loop)', () => {
        it('should converge within tolerance before reaching maxIterations', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id);

            const result = await strategy.setFlowRate(valve, 50);

            expect(result.isStabilized).toBe(true);
            expect(result.iterations).toBeLessThan(valve.config.maxIterations);
            expect(Math.abs(result.targetFlowRate - result.measuredFlowRate)).toBeLessThanOrEqual(valve.config.tolerance);
        });

        it('should skip the modbus write on the final stabilized iteration', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id);

            const result = await strategy.setFlowRate(valve, 50);

            // _connectClient() ouvre une nouvelle instance ModbusRTU a chaque ecriture : on
            // agrege les appels writeRegister sur tous les clients crees pendant la boucle.
            const totalWrites = mockModbusClients.reduce((sum, client) => sum + client.writeRegister.mock.calls.length, 0);
            expect(totalWrites).toEqual(result.iterations - 1);
        });

        it('should run until maxIterations and report not stabilized when the target is unreachable', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id, { minOpening: 0, maxOpening: 0 });

            const result = await strategy.setFlowRate(valve, 50);

            expect(result.isStabilized).toBe(false);
            expect(result.iterations).toEqual(valve.config.maxIterations);
        });

        it('should clamp the output current to the 4-20mA live-zero range at the extremes', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const closedValve = CreateValveModel(slave._id, { minOpening: 0, maxOpening: 0 });
            const openValve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });

            const closedResult = await strategy.setFlowRate(closedValve, 50);
            const openResult = await strategy.setFlowRate(openValve, 50);

            expect(closedResult.outputCurrentMa).toEqual(4);
            expect(openResult.outputCurrentMa).toEqual(20);
        });

        it('should write the register at (channel - 1) with the microamps equivalent of the opening', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100, channel: 3 });

            await strategy.setFlowRate(valve, 50);

            expect(mockModbusClients[0].writeRegister).toHaveBeenCalledWith(2, 20000);
        });
    });

    describe('connection handling', () => {
        it('should connect over TCP when the connection protocol is tcp', async () => {
            const slave = await CreateSlaveDevice(deviceRepository, { protocol: MasterProtocol.TCP, ipAddress: '10.0.0.5', port: 502 });
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });

            await strategy.setFlowRate(valve, 50);

            expect(mockModbusClients[0].connectTCP).toHaveBeenCalledWith('10.0.0.5', expect.objectContaining({ port: 502 }));
            expect(mockModbusClients[0].connectRTUBuffered).not.toHaveBeenCalled();
        });

        it('should connect over RTU when the connection protocol is rtu', async () => {
            const slave = await CreateSlaveDevice(deviceRepository, { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB2', baudRate: 19200 });
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });

            await strategy.setFlowRate(valve, 50);

            expect(mockModbusClients[0].connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB2', expect.objectContaining({ baudRate: 19200 }));
        });

        it('should throw for an unknown protocol', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const slaveConfig = slave.config as SlaveConfigModel;
            // 'foo' n'est pas une valeur valide de l'enum MasterProtocol : on ecrit directement en
            // base (hors validation Mongoose) pour simuler une donnee corrompue/legacy et verifier
            // que le service la rejette proprement a l'execution plutot qu'a l'ecriture.
            await connection.collection('devices').updateOne({ _id: slaveConfig.masterDeviceId } as never, { $set: { 'config.protocol': 'foo' } });
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });

            await expect(strategy.setFlowRate(valve, 50)).rejects.toThrow('Unknown protocol: foo');
        });

        it('should throw when no slave device is found for the deviceId', async () => {
            const valve = CreateValveModel('missing-connection-id', { minOpening: 100, maxOpening: 100 });

            await expect(strategy.setFlowRate(valve, 50)).rejects.toThrow('No slave device found for deviceId: missing-connection-id');
        });

        it('should throw when no master device is found for the slave', async () => {
            const orphanSlave = await deviceRepository.save(CreateSlaveDeviceModel('missing-master-id'));
            const valve = CreateValveModel(orphanSlave._id, { minOpening: 100, maxOpening: 100 });

            await expect(strategy.setFlowRate(valve, 50)).rejects.toThrow('No master device found for masterDeviceId: missing-master-id');
        });

        it('should close the modbus client connection after writing', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });

            await strategy.setFlowRate(valve, 50);

            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });

        it('should swallow a network-related write error instead of throwing', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });
            const networkError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => {
                const client = {
                    connectTCP: jest.fn().mockResolvedValue(undefined),
                    connectRTUBuffered: jest.fn().mockResolvedValue(undefined),
                    setID: jest.fn(),
                    setTimeout: jest.fn(),
                    writeRegister: jest.fn().mockRejectedValue(networkError),
                    close: jest.fn((cb?: () => void) => cb?.())
                };
                mockModbusClients.push(client);
                return client;
            });

            await expect(strategy.setFlowRate(valve, 50)).resolves.toBeDefined();

            expect(logger.error).toHaveBeenCalled();
        });

        it('should swallow a modbus-protocol error instead of throwing', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });
            const modbusError = Object.assign(new Error('illegal data address'), { modbusCode: 2 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => {
                const client = {
                    connectTCP: jest.fn().mockResolvedValue(undefined),
                    connectRTUBuffered: jest.fn().mockResolvedValue(undefined),
                    setID: jest.fn(),
                    setTimeout: jest.fn(),
                    writeRegister: jest.fn().mockRejectedValue(modbusError),
                    close: jest.fn((cb?: () => void) => cb?.())
                };
                mockModbusClients.push(client);
                return client;
            });

            await expect(strategy.setFlowRate(valve, 50)).resolves.toBeDefined();
        });

        it('should re-throw an unexpected write error that is neither network nor modbus-coded', async () => {
            const slave = await CreateSlaveDevice(deviceRepository);
            const valve = CreateValveModel(slave._id, { minOpening: 100, maxOpening: 100 });
            const unexpectedError = new Error('boom');
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => {
                const client = {
                    connectTCP: jest.fn().mockResolvedValue(undefined),
                    connectRTUBuffered: jest.fn().mockResolvedValue(undefined),
                    setID: jest.fn(),
                    setTimeout: jest.fn(),
                    writeRegister: jest.fn().mockRejectedValue(unexpectedError),
                    close: jest.fn((cb?: () => void) => cb?.())
                };
                mockModbusClients.push(client);
                return client;
            });

            await expect(strategy.setFlowRate(valve, 50)).rejects.toThrow('boom');
        });
    });
});
