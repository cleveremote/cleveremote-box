import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { InverterDeviceStrategy } from '@process/domain/services/device-strategies/inverter-device.strategy';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ModbusService } from '@process/domain/services/modbus.service';
import { buildOverrideParamsCases } from './build-override-params.spec-mock';

function CreateInverterDeviceModel(): DeviceModel {
    const device = new DeviceModel();
    device._id = 'device-1';
    device.type = DeviceType.SLAVE;
    device.kind = DeviceKind.INVERTER;
    return device;
}

function CreateComRequestRepositoryMock(): jest.Mocked<Pick<ComRequestRepository, 'getComRequestsByDeviceIdAndTypes'>> {
    return { getComRequestsByDeviceIdAndTypes: jest.fn().mockResolvedValue([]) };
}

function CreateModbusServiceMock(): jest.Mocked<Pick<ModbusService, 'execute'>> {
    return { execute: jest.fn().mockResolvedValue(undefined) };
}

describe('InverterDeviceStrategy', () => {
    let comRequestRepository: jest.Mocked<Pick<ComRequestRepository, 'getComRequestsByDeviceIdAndTypes'>>;
    let modbusService: jest.Mocked<Pick<ModbusService, 'execute'>>;
    let strategy: InverterDeviceStrategy;

    beforeEach(() => {
        comRequestRepository = CreateComRequestRepositoryMock();
        modbusService = CreateModbusServiceMock();
        strategy = new InverterDeviceStrategy(comRequestRepository as never, modbusService as never);
    });

    it('should have the INVERTER kind', () => {
        expect(strategy.kind).toEqual(DeviceKind.INVERTER);
    });

    it('should throw NotImplementedError on init/configure/write/read', async () => {
        const device = CreateInverterDeviceModel();

        await expect(strategy.init(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.configure(device)).rejects.toThrow(NotImplementedError);
        await expect(strategy.write(device, { name: 'value', value: 1 })).rejects.toThrow(NotImplementedError);
        await expect(strategy.read(device, { name: 'value', value: 0 })).rejects.toThrow(NotImplementedError);
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

    describe('buidOverrideParams (shared merge logic - see build-override-params.spec-mock.ts)', () => {
        it.each(buildOverrideParamsCases)('$name', ({ existing, override, expected }) => {
            const result = (strategy as unknown as { buidOverrideParams: (p: unknown, o: unknown) => unknown }).buidOverrideParams(existing, override);

            expect(result).toEqual(expected);
        });
    });
});
