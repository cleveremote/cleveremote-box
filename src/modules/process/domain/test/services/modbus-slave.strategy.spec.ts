import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel } from '@process/domain/models/device.model';
import { ModbusSlaveStrategy } from '@process/domain/services/device-strategies/modbus-slave.strategy';

function CreateDeviceModel(): DeviceModel {
    return Object.assign(new DeviceModel(), { _id: 'slave-1', name: 'slave' });
}

describe('ModbusSlaveStrategy', () => {
    let deviceCommandService: { runInitCommands: jest.Mock; runResetCommands: jest.Mock };
    let strategy: ModbusSlaveStrategy;

    beforeEach(() => {
        deviceCommandService = { runInitCommands: jest.fn().mockResolvedValue(undefined), runResetCommands: jest.fn().mockResolvedValue(undefined) };
        strategy = new ModbusSlaveStrategy(deviceCommandService as never);
    });

    it('should have the MODBUS_SLAVE kind', () => {
        expect(strategy.kind).toEqual(DeviceKind.MODBUS_SLAVE);
    });

    it('init() should apply the device init commands not yet applied', async () => {
        await strategy.init(CreateDeviceModel());

        expect(deviceCommandService.runInitCommands).toHaveBeenCalledWith('slave-1');
    });

    it('reset() should run the reset commands and re-apply every init command', async () => {
        await strategy.reset(CreateDeviceModel());

        expect(deviceCommandService.runResetCommands).toHaveBeenCalledWith('slave-1');
    });

    it('should throw NotImplementedError on configure/write/read', async () => {
        const device = CreateDeviceModel();

        await expect(strategy.configure(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.write(device, { name: 'x', value: 1 })).rejects.toThrow(NotImplementedError);
        await expect(strategy.read(device, { name: 'x', value: 1 })).rejects.toThrow(NotImplementedError);
    });
});
