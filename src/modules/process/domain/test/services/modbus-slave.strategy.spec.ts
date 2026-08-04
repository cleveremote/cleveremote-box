import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ModbusSlaveStrategy } from '@process/domain/services/device-strategies/modbus-slave.strategy';

function CreateSlaveDeviceModel(): DeviceModel {
    const device = new DeviceModel();
    device._id = 'device-1';
    device.type = DeviceType.SLAVE;
    device.kind = DeviceKind.MODBUS_SLAVE;
    return device;
}

function CreateComRequestModel(done: boolean): ComRequestModel {
    const comRequest = new ComRequestModel();
    comRequest._id = 'com-request-1';
    comRequest.config = { done } as never;
    return comRequest;
}

describe('ModbusSlaveStrategy', () => {
    let strategy: ModbusSlaveStrategy;
    let comRequestRepository: { getComRequestsByDeviceIdAndTypes: jest.Mock; save: jest.Mock };
    let modbusService: { execute: jest.Mock };
    let logger: { error: jest.Mock };

    beforeEach(() => {
        comRequestRepository = { getComRequestsByDeviceIdAndTypes: jest.fn().mockResolvedValue([]), save: jest.fn().mockResolvedValue(undefined) };
        modbusService = { execute: jest.fn().mockResolvedValue(undefined) };
        logger = { error: jest.fn() };
        strategy = new ModbusSlaveStrategy(comRequestRepository as never, modbusService as never, logger as never);
    });

    it('should have the MODBUS_SLAVE kind', () => {
        expect(strategy.kind).toEqual(DeviceKind.MODBUS_SLAVE);
    });

    describe('init', () => {
        it('should execute and mark as done every not-yet-done DIGITAL_IO_INIT comRequest', async () => {
            const device = CreateSlaveDeviceModel();
            const comRequest = CreateComRequestModel(false);
            comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);

            await strategy.init(device);

            expect(comRequestRepository.getComRequestsByDeviceIdAndTypes).toHaveBeenCalledWith(device._id, [ComRequestType.DIGITAL_IO_INIT]);
            expect(modbusService.execute).toHaveBeenCalledWith(comRequest, comRequest.config);
            expect(comRequest.config.done).toEqual(true);
            expect(comRequestRepository.save).toHaveBeenCalledWith(comRequest);
        });

        it('should skip comRequests already marked as done', async () => {
            const device = CreateSlaveDeviceModel();
            const comRequest = CreateComRequestModel(true);
            comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);

            await strategy.init(device);

            expect(modbusService.execute).not.toHaveBeenCalled();
            expect(comRequestRepository.save).not.toHaveBeenCalled();
        });

        it('should log and continue when a comRequest execution fails', async () => {
            const device = CreateSlaveDeviceModel();
            const comRequest = CreateComRequestModel(false);
            comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);
            modbusService.execute.mockRejectedValue(new Error('boom'));

            await expect(strategy.init(device)).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ comRequestId: comRequest._id, err: 'boom' }),
                'inverter reset write failed'
            );
        });
    });

    it('should throw NotImplementedError on reset/configure/write/read', async () => {
        const device = CreateSlaveDeviceModel();

        await expect(strategy.reset(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.configure(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.write(device, { name: 'value', value: 1 })).rejects.toThrow(NotImplementedError);
        await expect(strategy.read(device, { name: 'value', value: 0 })).rejects.toThrow(NotImplementedError);
    });
});
