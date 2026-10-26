import { BadRequestException } from '@nestjs/common';
import {
    DEVICE_KIND_SPECS, DeviceKind, DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel
} from '@process/domain/models/device.model';
import { ModbusDeviceService } from '@process/domain/services/modbus-device.service';
import { DEFAULT_UNCONFIGURED_UNIT_ID } from '@process/domain/utils/modbus-registers.util';
import { ModbusTransport } from '@register-map/domain/models/modbus-connection.model';
import { RegisterFunction } from '@register-map/domain/models/register-map.model';

function CreateMaster(config: Partial<MasterConfigModel> = {}): DeviceModel {
    const masterConfig = Object.assign(new MasterConfigModel(), {
        protocol: MasterProtocol.TCP, ipAddress: '192.168.1.26', port: 4196, timeout: 1500, ...config
    });
    return Object.assign(new DeviceModel(), { _id: 'master-1', type: DeviceType.MASTER, name: 'master', config: masterConfig });
}

function CreateSlave(slaveId: number): DeviceModel {
    const config = { slaveId, masterDeviceId: 'master-1' } as SlaveConfigModel;
    return Object.assign(new DeviceModel(), { _id: 'slave-1', type: DeviceType.SLAVE, name: 'slave', config });
}

describe('ModbusDeviceService', () => {
    let modbusBus: { execute: jest.Mock; scan: jest.Mock };
    let waveshareDiscoveryService: { refreshMasterAddress: jest.Mock };
    let logger: { log: jest.Mock; warn: jest.Mock };
    let service: ModbusDeviceService;

    beforeEach(() => {
        modbusBus = { execute: jest.fn().mockResolvedValue(undefined), scan: jest.fn().mockResolvedValue([]) };
        waveshareDiscoveryService = { refreshMasterAddress: jest.fn() };
        logger = { log: jest.fn(), warn: jest.fn() };
        service = new ModbusDeviceService(modbusBus as never, waveshareDiscoveryService as never, logger as never);
    });

    describe('toConnection', () => {
        it('should build a TCP or RTU connection from the master config', () => {
            expect(service.toConnection(CreateMaster().config as MasterConfigModel, 62))
                .toEqual(expect.objectContaining({ transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, timeout: 1500, unitId: 62 }));
            const rtu = CreateMaster({ protocol: MasterProtocol.RTU, path: '/dev/ttyUSB0', baudRate: 4800 }).config as MasterConfigModel;
            expect(service.toConnection(rtu, 3))
                .toEqual(expect.objectContaining({ transport: ModbusTransport.RTU, path: '/dev/ttyUSB0', baudRate: 4800, unitId: 3 }));
        });

        it('should give a refreshed connection on unreachable master when its ip changed, undefined otherwise', async () => {
            const connection = service.toConnection(CreateMaster().config as MasterConfigModel, 62);

            waveshareDiscoveryService.refreshMasterAddress.mockImplementation(async (config: MasterConfigModel) => {
                config.ipAddress = '192.168.1.99';
                return true;
            });
            await expect(connection.onUnreachable()).resolves.toEqual(expect.objectContaining({ host: '192.168.1.99', unitId: 62 }));

            waveshareDiscoveryService.refreshMasterAddress.mockResolvedValue(false);
            await expect(connection.onUnreachable()).resolves.toBeUndefined();
        });
    });

    describe('setSlaveAddress', () => {
        it('should write the new address to the address register of the slave at its current address', async () => {
            await service.setSlaveAddress(CreateMaster(), 0x4000, 1, 63);

            expect(modbusBus.execute).toHaveBeenCalledWith(
                expect.objectContaining({ host: '192.168.1.26', unitId: 1 }),
                { function: RegisterFunction.WRITE_SINGLE_REGISTER, address: 0x4000, length: 1, value: 63 }
            );
        });

        it('should reject an out-of-range address without touching the bus', async () => {
            await expect(service.setSlaveAddress(CreateMaster(), 0x4000, 1, 0)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.setSlaveAddress(CreateMaster(), 0x4000, 1, 256)).rejects.toBeInstanceOf(BadRequestException);
            expect(modbusBus.execute).not.toHaveBeenCalled();
        });

        it('should propagate bus errors', async () => {
            modbusBus.execute.mockRejectedValue(new Error('Timed out'));

            await expect(service.setSlaveAddress(CreateMaster(), 0x4000, 1, 63)).rejects.toThrow('Timed out');
        });
    });

    describe('resetSlaveAddress', () => {
        const spec = DEVICE_KIND_SPECS[DeviceKind.DIGITAL_IO_8_CH];

        it('should move the slave back to the first address of its range, through its discovery register', async () => {
            await service.resetSlaveAddress(CreateSlave(spec.range.min + 1), CreateMaster());

            expect(modbusBus.execute).toHaveBeenCalledWith(
                expect.objectContaining({ unitId: spec.range.min + 1 }),
                expect.objectContaining({ address: spec.discoveryRegister, value: spec.range.min })
            );
        });

        it('should do nothing when the slave already sits on the first address of its range', async () => {
            await service.resetSlaveAddress(CreateSlave(spec.range.min), CreateMaster());

            expect(modbusBus.execute).not.toHaveBeenCalled();
        });

        it('should skip a slave whose range has no discovery register', async () => {
            await service.resetSlaveAddress(CreateSlave(DEVICE_KIND_SPECS[DeviceKind.MODBUS_SLAVE].range.min + 1), CreateMaster());

            expect(modbusBus.execute).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalled();
        });
    });

    describe('scanDiscoveryRegisters', () => {
        it('should read each target on a short-timeout scan and return the first value of each responder', async () => {
            modbusBus.scan.mockImplementation(async (_connection, targets) => [{ ...targets[1], data: [62] }]);

            const found = await service.scanDiscoveryRegisters(CreateMaster(), [{ unitId: 1, register: 0x4000 }, { unitId: 61, register: 0x4000 }]);

            const [connection, targets] = modbusBus.scan.mock.calls[0];
            expect(connection).toEqual(expect.objectContaining({ host: '192.168.1.26', timeout: 200 }));
            expect(targets).toEqual([
                { unitId: 1, request: { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 0x4000, length: 1 } },
                { unitId: 61, request: { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 0x4000, length: 1 } }
            ]);
            expect(found).toEqual([{ unitId: 61, register: 0x4000, value: 62 }]);
        });

        it('should log and return nothing when the master cannot be reached', async () => {
            modbusBus.scan.mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));

            await expect(service.scanDiscoveryRegisters(CreateMaster(), [{ unitId: 1, register: 0x4000 }])).resolves.toEqual([]);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ masterId: 'master-1', err: 'refused' }),
                'discovery scan connection failed'
            );
        });
    });

    describe('probeMasterForNewSlave', () => {
        it('should probe the discovery registers of the master on the unconfigured unit id and return the first responder', async () => {
            modbusBus.scan.mockImplementation(async (_connection, targets) => targets.slice(1).map((t) => ({ ...t, data: [1] })));

            const master = CreateMaster({ discoveryRegisters: [0x4000, 0x0010] });

            await expect(service.probeMasterForNewSlave(master)).resolves.toBe(0x0010);
            expect(modbusBus.scan.mock.calls[0][1].map((t) => [t.unitId, t.request.address])).toEqual([
                [DEFAULT_UNCONFIGURED_UNIT_ID, 0x4000], [DEFAULT_UNCONFIGURED_UNIT_ID, 0x0010]
            ]);
        });

        it('should default to the Waveshare address register and return null when nothing answers', async () => {
            await expect(service.probeMasterForNewSlave(CreateMaster())).resolves.toBeNull();
            expect(modbusBus.scan.mock.calls[0][1].map((t) => t.request.address)).toEqual([0x4000]);
        });
    });
});
