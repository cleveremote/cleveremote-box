import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { ModbusSlaveStrategy } from '@process/domain/services/device-strategies/modbus-slave.strategy';

function CreateSlaveDeviceModel(): DeviceModel {
    const device = new DeviceModel();
    device._id = 'device-1';
    device.type = DeviceType.SLAVE;
    device.kind = DeviceKind.MODBUS_SLAVE;
    return device;
}

describe('ModbusSlaveStrategy', () => {
    let strategy: ModbusSlaveStrategy;

    beforeEach(() => {
        strategy = new ModbusSlaveStrategy({} as never);
    });

    it('should have the MODBUS_SLAVE kind', () => {
        expect(strategy.kind).toEqual(DeviceKind.MODBUS_SLAVE);
    });

    it('should throw NotImplementedError on init/reset/configure/write/read', async () => {
        const device = CreateSlaveDeviceModel();

        await expect(strategy.init(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.reset(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.configure(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.write(device, { name: 'value', value: 1 })).rejects.toThrow(NotImplementedError);
        await expect(strategy.read(device, { name: 'value', value: 0 })).rejects.toThrow(NotImplementedError);
    });
});
