import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { DeviceService } from '@process/domain/services/device.service';
import { DeviceStrategy } from '@process/domain/services/device-strategies/device-strategy.interface';

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

describe('DeviceService', () => {
    let modbusSlaveStrategy: DeviceStrategy;
    let inverterStrategy: DeviceStrategy;
    let service: DeviceService;

    beforeEach(() => {
        modbusSlaveStrategy = CreateStrategyMock(DeviceKind.MODBUS_SLAVE);
        inverterStrategy = CreateStrategyMock(DeviceKind.INVERTER);
        service = new DeviceService(CreateLoggerMock() as never, {} as never, [modbusSlaveStrategy, inverterStrategy]);
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
});
