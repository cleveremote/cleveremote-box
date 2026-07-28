import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel, DeviceType, MasterConfigModel, MasterProtocol } from '@process/domain/models/device.model';
import { DeviceService } from '@process/domain/services/device.service';
import { DeviceStrategy } from '@process/domain/services/device-strategies/device-strategy.interface';
import { ModbusService } from '@process/domain/services/modbus.service';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function CreateStrategyMock(kind: DeviceKind): DeviceStrategy {
    return {
        kind,
        init: jest.fn().mockResolvedValue(undefined),
        reset: jest.fn().mockResolvedValue(undefined),
        configure: jest.fn().mockResolvedValue(undefined),
        write: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue(42)
    };
}

function CreateDeviceModel(kind?: DeviceKind): DeviceModel {
    const device = new DeviceModel();
    device._id = 'device-1';
    device.type = DeviceType.SLAVE;
    device.kind = kind;
    return device;
}

function CreateMasterModel(id: string, discoveryRegisters?: number[]): DeviceModel {
    const device = new DeviceModel();
    device._id = id;
    device.name = id;
    device.type = DeviceType.MASTER;
    const config = new MasterConfigModel();
    config.protocol = MasterProtocol.TCP;
    config.ipAddress = '192.0.2.1';
    config.port = 502;
    config.discoveryRegisters = discoveryRegisters;
    device.config = config;
    return device;
}

function Wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('DeviceService', () => {
    let modbusSlaveStrategy: DeviceStrategy;
    let inverterStrategy: DeviceStrategy;
    let deviceRepository: { getByType: jest.Mock; get: jest.Mock };
    let modbusService: { probeMasterForNewSlave: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: DeviceService;

    beforeEach(() => {
        modbusSlaveStrategy = CreateStrategyMock(DeviceKind.MODBUS_SLAVE);
        inverterStrategy = CreateStrategyMock(DeviceKind.INVERTER);
        deviceRepository = { getByType: jest.fn().mockResolvedValue([]), get: jest.fn() };
        modbusService = { probeMasterForNewSlave: jest.fn().mockResolvedValue(undefined) };
        logger = CreateLoggerMock();
        service = new DeviceService(
            logger as never,
            deviceRepository as never,
            modbusService as unknown as ModbusService,
            [modbusSlaveStrategy, inverterStrategy]
        );
    });

    it('should dispatch to the strategy matching the device kind', async () => {
        const device = CreateDeviceModel(DeviceKind.INVERTER);
        const params = { name: 'value', value: 0 };

        await service.read(device, params);

        expect(inverterStrategy.read).toHaveBeenCalledWith(device, params);
        expect(modbusSlaveStrategy.read).not.toHaveBeenCalled();
    });

    it('should default to MODBUS_SLAVE when the device has no kind (legacy documents)', async () => {
        const device = CreateDeviceModel(undefined);
        const params = { name: 'value', value: 7 };

        await service.write(device, params);

        expect(modbusSlaveStrategy.write).toHaveBeenCalledWith(device, params);
    });

    it('should delegate init/reset/configure to the resolved strategy', async () => {
        const device = CreateDeviceModel(DeviceKind.MODBUS_SLAVE);

        await service.init(device);
        await service.reset(device);
        await service.configure(device);

        expect(modbusSlaveStrategy.init).toHaveBeenCalledWith(device);
        expect(modbusSlaveStrategy.reset).toHaveBeenCalledWith(device);
        expect(modbusSlaveStrategy.configure).toHaveBeenCalledWith(device);
    });

    it('should throw NotImplementedError for an unsupported device kind', async () => {
        const device = CreateDeviceModel('UNKNOWN' as DeviceKind);

        await expect(service.read(device, { name: 'value', value: 0 })).rejects.toThrow(NotImplementedError);
    });

    describe('watchMasterDevicesForNewSlaves', () => {
        it('should log and return a no-op handle when no MASTER devices exist', async () => {
            const handle = await service.watchMasterDevicesForNewSlaves(20);

            expect(logger.log).toHaveBeenCalledWith('no master devices with discoveryRegisters configured, slave discovery not started');
            await expect(handle.stop()).resolves.toBeUndefined();
            expect(modbusService.probeMasterForNewSlave).not.toHaveBeenCalled();
        });

        it('should skip masters without discoveryRegisters configured (opt-in, no fallback)', async () => {
            const masterWithout = CreateMasterModel('master-no-discovery', undefined);
            const masterWithEmpty = CreateMasterModel('master-empty-discovery', []);
            deviceRepository.getByType.mockResolvedValue([masterWithout, masterWithEmpty]);

            const handle = await service.watchMasterDevicesForNewSlaves(15);
            await Wait(40);
            await handle.stop();

            expect(logger.log).toHaveBeenCalledWith('no master devices with discoveryRegisters configured, slave discovery not started');
            expect(logger.debug).toHaveBeenCalledWith({ masterId: 'master-no-discovery' }, 'slave discovery disabled: no discoveryRegisters configured');
            expect(logger.debug).toHaveBeenCalledWith({ masterId: 'master-empty-discovery' }, 'slave discovery disabled: no discoveryRegisters configured');
            expect(modbusService.probeMasterForNewSlave).not.toHaveBeenCalled();
        });

        it('should probe each eligible master independently and repeatedly on its own interval', async () => {
            const masterA = CreateMasterModel('master-a', [0x4000]);
            const masterB = CreateMasterModel('master-b', [0x4000]);
            deviceRepository.getByType.mockResolvedValue([masterA, masterB]);

            const handle = await service.watchMasterDevicesForNewSlaves(15);
            await Wait(50);
            await handle.stop();

            const probedIds = modbusService.probeMasterForNewSlave.mock.calls.map(([master]: [DeviceModel]) => master._id);
            expect(probedIds.filter((id) => id === 'master-a').length).toBeGreaterThanOrEqual(2);
            expect(probedIds.filter((id) => id === 'master-b').length).toBeGreaterThanOrEqual(2);
        });

        it('should isolate masters: a stuck probe on one master must not pause polling on another', async () => {
            const masterA = CreateMasterModel('master-iso-a', [0x4000]);
            const masterB = CreateMasterModel('master-iso-b', [0x4000]);
            deviceRepository.getByType.mockResolvedValue([masterA, masterB]);
            modbusService.probeMasterForNewSlave.mockImplementation((master: DeviceModel) =>
                master._id === 'master-iso-a' ? new Promise(() => { /* never resolves */ }) : Promise.resolve()
            );

            const handle = await service.watchMasterDevicesForNewSlaves(15);
            await Wait(60);
            await handle.stop();

            const bCalls = modbusService.probeMasterForNewSlave.mock.calls.filter(([master]: [DeviceModel]) => master._id === 'master-iso-b');
            expect(bCalls.length).toBeGreaterThanOrEqual(2);
        });

        it('should log the error and resume polling when a probe rejects', async () => {
            const master = CreateMasterModel('master-err', [0x4000]);
            deviceRepository.getByType.mockResolvedValue([master]);
            modbusService.probeMasterForNewSlave
                .mockRejectedValueOnce(new Error('boom'))
                .mockResolvedValue(undefined);

            const handle = await service.watchMasterDevicesForNewSlaves(15);
            await Wait(50);
            await handle.stop();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ masterId: 'master-err', err: 'boom' }),
                'slave discovery poll failed unexpectedly'
            );
            expect(modbusService.probeMasterForNewSlave.mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it('should stop polling on all masters once stop() is called', async () => {
            const masterA = CreateMasterModel('master-stop-a', [0x4000]);
            const masterB = CreateMasterModel('master-stop-b', [0x4000]);
            deviceRepository.getByType.mockResolvedValue([masterA, masterB]);

            const handle = await service.watchMasterDevicesForNewSlaves(15);
            await Wait(40);
            await handle.stop();
            const countAfterStop = modbusService.probeMasterForNewSlave.mock.calls.length;
            await Wait(60);

            expect(modbusService.probeMasterForNewSlave.mock.calls.length).toEqual(countAfterStop);
            expect(logger.log).toHaveBeenCalledWith('slave device discovery stopped for all masters');
        });
    });
});
