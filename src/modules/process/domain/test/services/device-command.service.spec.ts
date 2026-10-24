import { DeviceCommandService } from '@process/domain/services/device-command.service';
import { DeviceCommandModel } from '@process/domain/models/device-command.model';
import { DeviceKind, DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { RegisterMapNotFoundError } from '@register-map/domain/errors/register-map.error';
import { ModbusTransport } from '@register-map/domain/models/modbus-connection.model';
import { RegisterFunction, RegisterMapTemplate } from '@register-map/domain/models/register-map.model';
import { RegisterMapService } from '@register-map/domain/services/register-map.service';

function CreateTemplate(): RegisterMapTemplate {
    return {
        kind: DeviceKind.DIGITAL_IO_8_CH,
        schemaVersion: 1,
        hardware: { manufacturer: 'Waveshare', model: 'IO 8CH' },
        enums: {},
        registerMap: [
            {
                id: 'outputs', label: 'Sorties', area: 'coil', access: 'rw', address: { start: 0, count: 8 },
                operations: [{ id: 'set', label: 'Set', function: RegisterFunction.WRITE_SINGLE_COIL, fc: 5, scope: 'channel' }]
            },
            {
                id: 'analog', label: 'Consignes', area: 'holdingRegister', access: 'rw', address: { start: 0, count: 8 },
                operations: [{ id: 'set', label: 'Set', function: RegisterFunction.WRITE_SINGLE_REGISTER, fc: 6, scope: 'channel', input: { type: 'number', min: 0, max: 10000 } }]
            }
        ]
    };
}

function CreateDevice(_id: string, type: DeviceType, config: MasterConfigModel | SlaveConfigModel): DeviceModel {
    return Object.assign(new DeviceModel(), { _id, type, name: _id, description: '', config });
}

function CreateCommand(overrides: Partial<DeviceCommandModel> = {}): DeviceCommandModel {
    return Object.assign(new DeviceCommandModel(), {
        _id: 'cmd-1', deviceId: 'slave-1', name: 'DO', blockId: 'outputs', operationId: 'set', channel: 0, value: 0, ...overrides
    });
}

describe('DeviceCommandService', () => {
    let devices: Record<string, DeviceModel>;
    let deviceCommandRepository: { get: jest.Mock };
    let deviceRepository: { get: jest.Mock };
    let registerMapService: RegisterMapService;
    let registerMapLoader: { loadFromDirectory: jest.Mock };
    let modbusService: { runExclusive: jest.Mock };
    let waveshareDiscoveryService: { refreshMasterAddress: jest.Mock };
    let service: DeviceCommandService;

    beforeEach(() => {
        const master = { protocol: MasterProtocol.TCP, ipAddress: '192.168.1.26', port: 4196, timeout: 1500, deviceId: 'WS-1' } as MasterConfigModel;
        devices = {
            'master-1': CreateDevice('master-1', DeviceType.MASTER, master),
            'slave-1': CreateDevice('slave-1', DeviceType.SLAVE, { slaveId: 62, masterDeviceId: 'master-1', kind: DeviceKind.DIGITAL_IO_8_CH })
        };
        deviceCommandRepository = { get: jest.fn().mockResolvedValue(CreateCommand()) };
        deviceRepository = { get: jest.fn((id: string) => Promise.resolve(devices[id] ?? null)) };
        registerMapService = new RegisterMapService({} as never, {} as never, {} as never);
        jest.spyOn(registerMapService, 'execute').mockResolvedValue({ isOk: true } as never);
        registerMapLoader = { loadFromDirectory: jest.fn().mockReturnValue([CreateTemplate()]) };
        modbusService = { runExclusive: jest.fn((run: () => Promise<unknown>) => run()) };
        waveshareDiscoveryService = { refreshMasterAddress: jest.fn() };
        service = new DeviceCommandService(
            deviceCommandRepository as never,
            deviceRepository as never,
            registerMapService,
            registerMapLoader as never,
            modbusService as never,
            waveshareDiscoveryService as never
        );
    });

    describe('execute', () => {
        it('should run the command on the slave template through the modbus queue, with the master TCP connection', async () => {
            await service.execute('cmd-1');

            expect(deviceCommandRepository.get).toHaveBeenCalledWith('cmd-1');
            expect(modbusService.runExclusive).toHaveBeenCalled();
            expect(registerMapService.execute).toHaveBeenCalledWith(
                expect.objectContaining({ kind: DeviceKind.DIGITAL_IO_8_CH }),
                expect.objectContaining({ transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, unitId: 62, timeout: 1500 }),
                { blockId: 'outputs', operationId: 'set', channel: 0, value: 0, isPersistent: undefined, isConfirmed: undefined }
            );
        });

        it('should apply the override, ignoring undefined values', async () => {
            await service.execute(CreateCommand({ channel: 5 }), { channel: undefined, value: 1 });

            expect(deviceCommandRepository.get).not.toHaveBeenCalled();
            expect(registerMapService.execute).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ channel: 5, value: 1 }));
        });

        it('should build an RTU connection for an RTU master', async () => {
            devices['master-1'].config = { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB0', baudRate: 4800 } as MasterConfigModel;

            await service.execute('cmd-1');

            expect(registerMapService.execute).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ transport: ModbusTransport.RTU, path: '/dev/ttyUSB0', baudRate: 4800, unitId: 62 }),
                expect.anything()
            );
        });

        it('should give a refreshed connection on unreachable master when its ip changed, undefined otherwise', async () => {
            await service.execute('cmd-1');
            const connection = (registerMapService.execute as jest.Mock).mock.calls[0][1];

            waveshareDiscoveryService.refreshMasterAddress.mockImplementation(async (config: MasterConfigModel) => {
                config.ipAddress = '192.168.1.99';
                return true;
            });
            await expect(connection.onUnreachable()).resolves.toEqual(expect.objectContaining({ host: '192.168.1.99', unitId: 62 }));

            waveshareDiscoveryService.refreshMasterAddress.mockResolvedValue(false);
            await expect(connection.onUnreachable()).resolves.toBeUndefined();
        });

        it('should load the templates only once', async () => {
            await service.execute('cmd-1');
            await service.execute('cmd-1');

            expect(registerMapLoader.loadFromDirectory).toHaveBeenCalledTimes(1);
        });

        it('should reject an unknown command, a slave without kind or a missing master', async () => {
            deviceCommandRepository.get.mockResolvedValueOnce(null);
            await expect(service.execute('missing')).rejects.toBeInstanceOf(RegisterMapNotFoundError);

            (devices['slave-1'].config as SlaveConfigModel).kind = undefined;
            await expect(service.execute('cmd-1')).rejects.toBeInstanceOf(RegisterMapNotFoundError);

            (devices['slave-1'].config as SlaveConfigModel).kind = DeviceKind.DIGITAL_IO_8_CH;
            delete devices['master-1'];
            await expect(service.execute('cmd-1')).rejects.toBeInstanceOf(RegisterMapNotFoundError);
        });

        it('should reject a kind without register map', async () => {
            (devices['slave-1'].config as SlaveConfigModel).kind = DeviceKind.PRESSURE_V1;

            await expect(service.execute('cmd-1')).rejects.toThrow(`Aucune register map pour le kind ${DeviceKind.PRESSURE_V1}`);
        });
    });

    describe('isDigitalOutput', () => {
        it('should be true for a coil block and false otherwise', async () => {
            await expect(service.isDigitalOutput('cmd-1')).resolves.toBe(true);

            deviceCommandRepository.get.mockResolvedValue(CreateCommand({ blockId: 'analog' }));
            await expect(service.isDigitalOutput('cmd-1')).resolves.toBe(false);
        });
    });

    describe('numberRange', () => {
        it('should return the numeric input range of the operation, undefined when not numeric', async () => {
            await expect(service.numberRange('cmd-1')).resolves.toBeUndefined();

            deviceCommandRepository.get.mockResolvedValue(CreateCommand({ blockId: 'analog' }));
            await expect(service.numberRange('cmd-1')).resolves.toEqual({ min: 0, max: 10000 });
        });
    });
});
