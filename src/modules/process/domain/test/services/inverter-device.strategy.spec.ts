import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { InverterDeviceStrategy } from '@process/domain/services/device-strategies/inverter-device.strategy';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ModbusService } from '@process/domain/services/modbus.service';

function CreateInverterDeviceModel(): DeviceModel {
    const device = new DeviceModel();
    device._id = 'device-1';
    device.type = DeviceType.SLAVE;
    device.kind = DeviceKind.INVERTER;
    return device;
}

function CreateComRequestRepositoryMock(): jest.Mocked<Pick<ComRequestRepository, 'getComRequestsByDeviceIdAndTypes' | 'save'>> {
    return {
        getComRequestsByDeviceIdAndTypes: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockImplementation(model => Promise.resolve(model))
    };
}

function CreateModbusServiceMock(): jest.Mocked<Pick<ModbusService, 'execute'>> {
    return { execute: jest.fn().mockResolvedValue(undefined) };
}

function CreateLoggerMock() {
    return { error: jest.fn(), log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}

describe('InverterDeviceStrategy', () => {
    let comRequestRepository: jest.Mocked<Pick<ComRequestRepository, 'getComRequestsByDeviceIdAndTypes' | 'save'>>;
    let modbusService: jest.Mocked<Pick<ModbusService, 'execute'>>;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let strategy: InverterDeviceStrategy;

    beforeEach(() => {
        comRequestRepository = CreateComRequestRepositoryMock();
        modbusService = CreateModbusServiceMock();
        logger = CreateLoggerMock();
        strategy = new InverterDeviceStrategy(comRequestRepository as never, modbusService as never, logger as never);
    });

    it('should have the INVERTER kind', () => {
        expect(strategy.kind).toEqual(DeviceKind.INVERTER);
    });

    it('should throw NotImplementedError on configure/write/read', async () => {
        const device = CreateInverterDeviceModel();

        await expect(strategy.configure(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.write(device, { name: 'value', value: 1 })).rejects.toThrow(NotImplementedError);
        await expect(strategy.read(device, { name: 'value', value: 0 })).rejects.toThrow(NotImplementedError);
    });

    it('init() should mark the comRequest as done and persist it after a successful execute', async () => {
        const device = CreateInverterDeviceModel();
        const comRequest: ComRequestModel = {
            _id: 'com-request-1',
            deviceId: device._id,
            name: 'inverter-write',
            type: [ComRequestType.INVERTER_WRITE],
            config: { address: 10, function: [], params: { value: 42 } },
            deletedAt: null
        } as ComRequestModel;
        comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);

        await strategy.init(device);

        expect(modbusService.execute).toHaveBeenCalledWith(comRequest, expect.objectContaining({ address: 10 }));
        expect(comRequest.config.done).toBe(true);
        expect(comRequestRepository.save).toHaveBeenCalledWith(comRequest);
    });

    it('init() should skip a comRequest whose done flag is already true', async () => {
        const device = CreateInverterDeviceModel();
        const comRequest: ComRequestModel = {
            _id: 'com-request-1',
            deviceId: device._id,
            name: 'inverter-write',
            type: [ComRequestType.INVERTER_WRITE],
            config: { address: 10, function: [], params: { value: 42 }, done: true },
            deletedAt: null
        } as ComRequestModel;
        comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);

        await strategy.init(device);

        expect(modbusService.execute).not.toHaveBeenCalled();
        expect(comRequestRepository.save).not.toHaveBeenCalled();
    });

    it('init() should not persist done and should continue the loop when execute fails', async () => {
        const device = CreateInverterDeviceModel();
        const failingComRequest: ComRequestModel = {
            _id: 'com-request-1',
            deviceId: device._id,
            name: 'inverter-write-1',
            type: [ComRequestType.INVERTER_WRITE],
            config: { address: 10, function: [], params: { value: 42 } },
            deletedAt: null
        } as ComRequestModel;
        const okComRequest: ComRequestModel = {
            _id: 'com-request-2',
            deviceId: device._id,
            name: 'inverter-write-2',
            type: [ComRequestType.INVERTER_WRITE],
            config: { address: 20, function: [], params: { value: 1 } },
            deletedAt: null
        } as ComRequestModel;
        comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([failingComRequest, okComRequest]);
        modbusService.execute.mockRejectedValueOnce(new Error('modbus write failed'));

        await strategy.init(device);

        expect(failingComRequest.config.done).toBeFalsy();
        expect(okComRequest.config.done).toBe(true);
        expect(comRequestRepository.save).toHaveBeenCalledTimes(1);
        expect(comRequestRepository.save).toHaveBeenCalledWith(okComRequest);
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ comRequestId: failingComRequest._id }),
            'inverter init write failed'
        );
    });

    it('reset() should mark the comRequest as done and persist it after a successful execute', async () => {
        const device = CreateInverterDeviceModel();
        const comRequest: ComRequestModel = {
            _id: 'com-request-1',
            deviceId: device._id,
            name: 'inverter-write',
            type: [ComRequestType.INVERTER_WRITE],
            config: { address: 10, function: [], params: { value: 42 }, done: true },
            deletedAt: null
        } as ComRequestModel;
        comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);

        await strategy.reset(device);

        expect(modbusService.execute).toHaveBeenCalledWith(comRequest, expect.objectContaining({ address: 10 }));
        expect(comRequest.config.done).toBe(true);
        expect(comRequestRepository.save).toHaveBeenCalledWith(comRequest);
    });

    it('should execute an override for each INVERTER_WRITE comRequest of the device', async () => {
        const device = CreateInverterDeviceModel();
        const comRequest: ComRequestModel = {
            _id: 'com-request-1',
            deviceId: device._id,
            name: 'inverter-write',
            type: [ComRequestType.INVERTER_WRITE],
            config: { address: 10, function: [], params: { value: 42 } },
            deletedAt: null
        } as ComRequestModel;
        comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);

        await strategy.reset(device);

        expect(comRequestRepository.getComRequestsByDeviceIdAndTypes).toHaveBeenCalledWith(device._id, [ComRequestType.INVERTER_WRITE]);
        expect(modbusService.execute).toHaveBeenCalledWith(comRequest, expect.objectContaining({ address: 10 }));
    });

    it('should preserve the existing persistence config when reset() (whose override never sets one) is used', async () => {
        const device = CreateInverterDeviceModel();
        const comRequest: ComRequestModel = {
            _id: 'com-request-1',
            deviceId: device._id,
            name: 'inverter-write',
            type: [ComRequestType.INVERTER_WRITE],
            config: { address: 10, function: [], params: { value: 42, persistence: { persist: true, address: 7 } } },
            deletedAt: null
        } as ComRequestModel;
        comRequestRepository.getComRequestsByDeviceIdAndTypes.mockResolvedValue([comRequest]);

        await strategy.reset(device);

        expect(modbusService.execute).toHaveBeenCalledWith(comRequest, expect.objectContaining({
            params: expect.objectContaining({ persistence: { persist: true, address: 7 } })
        }));
    });
});
