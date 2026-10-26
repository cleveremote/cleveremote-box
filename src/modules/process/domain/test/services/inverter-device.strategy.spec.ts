import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel } from '@process/domain/models/device.model';
import { InverterDeviceStrategy } from '@process/domain/services/device-strategies/inverter-device.strategy';

function CreateDeviceModel(): DeviceModel {
    return Object.assign(new DeviceModel(), { _id: 'inverter-1', name: 'inverter' });
}

describe('InverterDeviceStrategy', () => {
    let deviceCommandService: { runInitCommands: jest.Mock; runResetCommands: jest.Mock };
    let strategy: InverterDeviceStrategy;

    beforeEach(() => {
        deviceCommandService = { runInitCommands: jest.fn().mockResolvedValue(undefined), runResetCommands: jest.fn().mockResolvedValue(undefined) };
        strategy = new InverterDeviceStrategy(deviceCommandService as never);
    });

    it('should have the INVERTER kind', () => {
        expect(strategy.kind).toEqual(DeviceKind.INVERTER_VEICHI_SI23_V1);
    });

    it('init() should apply the inverter init commands not yet applied', async () => {
        await strategy.init(CreateDeviceModel());

        expect(deviceCommandService.runInitCommands).toHaveBeenCalledWith('inverter-1');
    });

    it('reset() should run the reset commands and re-apply every inverter init command', async () => {
        await strategy.reset(CreateDeviceModel());

        expect(deviceCommandService.runResetCommands).toHaveBeenCalledWith('inverter-1');
    });

    it('should throw NotImplementedError on configure/write/read', async () => {
        const device = CreateDeviceModel();

        await expect(strategy.configure(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.write(device, { name: 'F00.02', value: 1 })).rejects.toThrow(NotImplementedError);
        await expect(strategy.read(device, { name: 'F00.02', value: 1 })).rejects.toThrow(NotImplementedError);
    });
});
