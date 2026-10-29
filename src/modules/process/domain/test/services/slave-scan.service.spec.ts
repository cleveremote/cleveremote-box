import { SlaveScanService, ScannedSlave } from '@process/domain/services/slave-provisioning/scan/slave-scan.service';
import { DeviceKind, DeviceType, DiscoveryAddressRegister, SlaveTemplate } from '@process/domain/models/device.model';
import { CreateLoggerMock, DIGITAL_IO_TEMPLATE, MASTER_ID } from './slave-provisioning.spec-mock';

async function Collect(scan: AsyncGenerator<ScannedSlave>): Promise<ScannedSlave[]> {
    const scanned: ScannedSlave[] = [];
    for await (const slave of scan) scanned.push(slave);
    return scanned;
}

describe('SlaveScanService', () => {
    const master = { _id: MASTER_ID, type: DeviceType.MASTER, config: {} };
    let deviceRepository: { get: jest.Mock; getSlavesByMasterId: jest.Mock };
    let modbusDeviceService: { scanDiscoveryRegisters: jest.Mock; setSlaveAddress: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: SlaveScanService;

    beforeEach(() => {
        deviceRepository = { get: jest.fn().mockResolvedValue(master), getSlavesByMasterId: jest.fn().mockResolvedValue([]) };
        modbusDeviceService = { scanDiscoveryRegisters: jest.fn().mockResolvedValue([]), setSlaveAddress: jest.fn().mockResolvedValue(true) };
        logger = CreateLoggerMock();
        service = new SlaveScanService(deviceRepository as never, modbusDeviceService as never, logger as never);
    });

    it('should probe the first unit id of each range and readdress the new module', async () => {
        deviceRepository.getSlavesByMasterId.mockResolvedValue([{ config: { slaveId: 62 } }]);
        modbusDeviceService.scanDiscoveryRegisters.mockResolvedValue([
            { unitId: 61, register: 0x4000, value: 61 },
            { unitId: 11, register: 0x0005, value: 95 }
        ]);

        const scanned = await Collect(service.scan(MASTER_ID, [DIGITAL_IO_TEMPLATE]));

        const targets = modbusDeviceService.scanDiscoveryRegisters.mock.calls[0][1] as { unitId: number; register: number }[];
        expect(targets).toHaveLength(10);
        expect(targets).toContainEqual({ unitId: 1, register: DiscoveryAddressRegister.INVERTER });
        expect(targets).toContainEqual({ unitId: 81, register: DiscoveryAddressRegister.ANALOG_INPUT });
        expect(modbusDeviceService.setSlaveAddress).toHaveBeenCalledWith(master, 0x4000, 61, 63);
        expect(scanned).toEqual([{ template: DIGITAL_IO_TEMPLATE, kind: DeviceKind.DIGITAL_IO_8_CH, slaveId: 63 }]);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should not readdress a module without template for its type', async () => {
        modbusDeviceService.scanDiscoveryRegisters.mockResolvedValue([{ unitId: 81, register: 0x4000, value: 81 }]);

        const scanned = await Collect(service.scan(MASTER_ID, [DIGITAL_IO_TEMPLATE]));

        expect(scanned).toEqual([]);
        expect(modbusDeviceService.setSlaveAddress).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should skip a module whose address write fails', async () => {
        modbusDeviceService.scanDiscoveryRegisters.mockResolvedValue([{ unitId: 61, register: 0x4000, value: 61 }]);
        modbusDeviceService.setSlaveAddress.mockRejectedValue(new Error('timeout'));

        const scanned = await Collect(service.scan(MASTER_ID, [DIGITAL_IO_TEMPLATE]));

        expect(scanned).toEqual([]);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('should readdress the next module only once the previous one is consumed', async () => {
        const analogInput = { ...DIGITAL_IO_TEMPLATE, _id: 'ai', kind: DeviceKind.ANALOG_INPUT_8_CH } as SlaveTemplate;
        modbusDeviceService.scanDiscoveryRegisters.mockResolvedValue([
            { unitId: 61, register: 0x4000, value: 61 },
            { unitId: 81, register: 0x4000, value: 81 }
        ]);

        const scan = service.scan(MASTER_ID, [DIGITAL_IO_TEMPLATE, analogInput]);
        await scan.next();

        expect(modbusDeviceService.setSlaveAddress).toHaveBeenCalledTimes(1);
        await scan.return(undefined);
        expect(modbusDeviceService.setSlaveAddress).toHaveBeenCalledTimes(1);
    });

    it('should throw when master is missing or not a MASTER', async () => {
        deviceRepository.get.mockResolvedValue(null);
        await expect(Collect(service.scan(MASTER_ID, []))).rejects.toThrow();
        deviceRepository.get.mockResolvedValue({ _id: MASTER_ID, type: DeviceType.SLAVE });
        await expect(Collect(service.scan(MASTER_ID, []))).rejects.toThrow();
    });
});
