import { DeviceConnectivityModel, DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { DeviceConnectivityService } from '@process/domain/services/device-connectivity.service';

function CreateMaster(_id = 'master-1'): DeviceModel {
    const config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.TCP, ipAddress: '192.168.1.26', port: 502 });
    return Object.assign(new DeviceModel(), { _id, type: DeviceType.MASTER, name: _id, config });
}

function CreateSlave(_id: string, masterDeviceId = 'master-1'): DeviceModel {
    const config = { slaveId: 62, masterDeviceId } as SlaveConfigModel;
    return Object.assign(new DeviceModel(), { _id, type: DeviceType.SLAVE, name: _id, config });
}

describe('DeviceConnectivityService', () => {
    let devices: DeviceModel[];
    let deviceRepository: { get: jest.Mock; getByType: jest.Mock; getSlavesByMasterId: jest.Mock; updateConnectivity: jest.Mock };
    let modbusDeviceService: { checkMaster: jest.Mock; checkSlave: jest.Mock };
    let wsService: { sendMessage: jest.Mock };
    let logger: { log: jest.Mock; warn: jest.Mock };
    let service: DeviceConnectivityService;

    // le mock renvoie toujours les memes instances : l'etat ecrit sur device.connectivity tient lieu de base
    beforeEach(() => {
        devices = [CreateMaster(), CreateSlave('slave-1'), CreateSlave('slave-2')];
        deviceRepository = {
            get: jest.fn(async (id: string) => devices.find((device) => device._id === id) ?? null),
            getByType: jest.fn(async (type: DeviceType) => devices.filter((device) => device.type === type)),
            getSlavesByMasterId: jest.fn(async (id: string) =>
                devices.filter((device) => (device.config as SlaveConfigModel).masterDeviceId === id)),
            updateConnectivity: jest.fn().mockResolvedValue(undefined)
        };
        modbusDeviceService = { checkMaster: jest.fn().mockResolvedValue(undefined), checkSlave: jest.fn().mockResolvedValue(undefined) };
        wsService = { sendMessage: jest.fn().mockResolvedValue('ok') };
        logger = { log: jest.fn(), warn: jest.fn() };
        service = new DeviceConnectivityService(deviceRepository as never, modbusDeviceService as never, wsService as never, logger as never);
    });

    describe('checkConnectivity', () => {
        it('should check a master then each of its slaves', async () => {
            modbusDeviceService.checkSlave.mockImplementation(async (slave: DeviceModel) => {
                if (slave._id === 'slave-2') throw new Error('Timed out');
            });

            const states = await service.checkConnectivity('master-1');

            expect(states.map(({ deviceId, connected, error }) => ({ deviceId, connected, error }))).toEqual([
                { deviceId: 'master-1', connected: true, error: undefined },
                { deviceId: 'slave-1', connected: true, error: undefined },
                { deviceId: 'slave-2', connected: false, error: 'Timed out' }
            ]);
            expect(states[0].changedAt).toBeInstanceOf(Date);
        });

        it('should mark the slaves of an unreachable master as disconnected without probing them', async () => {
            modbusDeviceService.checkMaster.mockRejectedValue(new Error('ECONNREFUSED'));

            const states = await service.checkConnectivity('master-1');

            expect(modbusDeviceService.checkSlave).not.toHaveBeenCalled();
            expect(states.map(({ connected, error }) => ({ connected, error }))).toEqual([
                { connected: false, error: 'ECONNREFUSED' },
                { connected: false, error: 'master unreachable' },
                { connected: false, error: 'master unreachable' }
            ]);
        });

        it('should check the master first, then a single slave behind it', async () => {
            const states = await service.checkConnectivity('slave-1');

            expect(modbusDeviceService.checkMaster).toHaveBeenCalledWith(devices[0]);
            expect(modbusDeviceService.checkSlave).toHaveBeenCalledWith(devices[1], devices[0]);
            expect(states).toEqual([expect.objectContaining({ deviceId: 'slave-1', connected: true })]);
            expect(devices[0].connectivity).toEqual(expect.objectContaining({ connected: true }));
        });

        it('should not probe a single slave behind an unreachable master', async () => {
            modbusDeviceService.checkMaster.mockRejectedValue(new Error('ECONNREFUSED'));

            const states = await service.checkConnectivity('slave-1');

            expect(modbusDeviceService.checkSlave).not.toHaveBeenCalled();
            expect(states).toEqual([expect.objectContaining({ deviceId: 'slave-1', connected: false, error: 'master unreachable' })]);
            expect(devices[0].connectivity).toEqual(expect.objectContaining({ connected: false, error: 'ECONNREFUSED' }));
        });

        it('should mark a slave without master as disconnected', async () => {
            devices.push(CreateSlave('orphan', 'unknown-master'));

            await expect(service.checkConnectivity('orphan'))
                .resolves.toEqual([expect.objectContaining({ deviceId: 'orphan', connected: false, error: 'master not found' })]);
        });

        it('should reject an unknown device', async () => {
            await expect(service.checkConnectivity('unknown')).rejects.toThrow('Device unknown not found');
        });

        it('should persist the state of every device on its first check', async () => {
            const states = await service.checkConnectivity('master-1');

            expect(deviceRepository.updateConnectivity.mock.calls).toEqual(states.map((state) => [state.deviceId, state]));
        });

        it('should keep checking when the state cannot be saved', async () => {
            deviceRepository.updateConnectivity.mockRejectedValue(new Error('mongo down'));

            await expect(service.checkConnectivity('master-1')).resolves.toHaveLength(3);
            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'master-1', err: 'mongo down' }), 'device connectivity save failed');
        });

        it('should save and push the state only on first check or when it changes', async () => {
            await service.checkConnectivity('slave-1');
            const persisted = devices[1].connectivity;
            deviceRepository.updateConnectivity.mockClear();
            wsService.sendMessage.mockClear();

            await expect(service.checkConnectivity('slave-1')).resolves.toEqual([persisted]);
            expect(deviceRepository.updateConnectivity).not.toHaveBeenCalled();
            expect(wsService.sendMessage).not.toHaveBeenCalled();

            modbusDeviceService.checkSlave.mockRejectedValue(new Error('Timed out'));
            await service.checkConnectivity('slave-1');

            expect(deviceRepository.updateConnectivity).toHaveBeenCalledTimes(1);
            expect(deviceRepository.updateConnectivity).toHaveBeenCalledWith('slave-1', expect.objectContaining({ connected: false, error: 'Timed out' }));
            expect(wsService.sendMessage).toHaveBeenCalledTimes(2);
            const [local, remote] = wsService.sendMessage.mock.calls;
            expect(local[0].pattern).toBe('agg/synchronize/device-status');
            expect([local[1], remote[1]]).toEqual([true, false]);
            expect(JSON.parse(local[0].data)).toEqual(expect.objectContaining({ deviceId: 'slave-1', connected: false }));
            expect(devices[1].connectivity.changedAt).not.toBe(persisted.changedAt);
        });

        // modbus-serial leve des objets qui ne sont pas des instances d'Error (TransactionTimedOutError...)
        it('should keep the message of a modbus-serial error that is not an Error instance', async () => {
            modbusDeviceService.checkSlave.mockRejectedValue({ name: 'TransactionTimedOutError', message: 'Timed out', errno: 'ETIMEDOUT' });

            await expect(service.checkConnectivity('slave-1'))
                .resolves.toEqual([expect.objectContaining({ connected: false, error: 'Timed out' })]);
        });

        it('should replace a persisted error when the message changes', async () => {
            devices[1].connectivity = Object.assign(new DeviceConnectivityModel(), {
                deviceId: 'slave-1', connected: false, changedAt: new Date(), error: '[object Object]'
            });
            modbusDeviceService.checkSlave.mockRejectedValue(new Error('Timed out'));

            await expect(service.checkConnectivity('slave-1'))
                .resolves.toEqual([expect.objectContaining({ connected: false, error: 'Timed out' })]);
            expect(deviceRepository.updateConnectivity).toHaveBeenCalledWith('slave-1', expect.objectContaining({ error: 'Timed out' }));
        });
    });

    describe('checkAll', () => {
        it('should check every master and mark orphan slaves as disconnected', async () => {
            devices.push(CreateSlave('orphan', 'unknown-master'));

            const states = await service.checkAll();

            expect(states.map(({ deviceId, connected }) => [deviceId, connected])).toEqual([
                ['master-1', true], ['slave-1', true], ['slave-2', true], ['orphan', false]
            ]);
        });
    });
});
