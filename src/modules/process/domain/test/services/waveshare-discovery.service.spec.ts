import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol } from '@process/domain/models/device.model';
import { WaveshareDiscoveryService } from '@process/domain/services/waveshare-discovery.service';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function CreateMasterModel(id: string, deviceId: string, ipAddress: string): DeviceModel {
    const device = new DeviceModel();
    device._id = id;
    device.type = DeviceType.MASTER;
    device.config = { protocol: MasterProtocol.TCP, deviceId, ipAddress, port: 502 };
    return device;
}

describe('WaveshareDiscoveryService.discover', () => {
    let deviceRepository: { getByType: jest.Mock; save: jest.Mock };
    let service: WaveshareDiscoveryService;

    beforeEach(() => {
        deviceRepository = {
            getByType: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockImplementation(async (model: DeviceModel) => ({ ...model, _id: model._id ?? 'new-id' })),
        };
        service = new WaveshareDiscoveryService(deviceRepository as any, CreateLoggerMock() as any);
    });

    it('should create a TCP master for a newly discovered gateway', async () => {
        jest.spyOn(service, 'scanNetwork').mockResolvedValue([{ ip: '192.168.1.50', port: 1092, hex: '', deviceId: 'AABBCCDDEEFF', name: 'GW1' }]);

        const created = await service.discover();

        expect(created).toHaveLength(1);
        const saved = deviceRepository.save.mock.calls[0][0] as DeviceModel;
        expect(saved._id).toBeUndefined();
        expect(saved.type).toBe(DeviceType.MASTER);
        expect(saved.name).toBe('GW1');
        expect(saved.config).toEqual(expect.objectContaining({ protocol: MasterProtocol.TCP, ipAddress: '192.168.1.50', deviceId: 'AABBCCDDEEFF', port: 502 }));
    });

    it('should not duplicate an already known master with the same ip', async () => {
        deviceRepository.getByType.mockResolvedValue([CreateMasterModel('m1', 'aabbccddeeff', '192.168.1.50')]);
        jest.spyOn(service, 'scanNetwork').mockResolvedValue([{ ip: '192.168.1.50', port: 1092, hex: '', deviceId: 'AABBCCDDEEFF' }]);

        const created = await service.discover();

        expect(created).toEqual([]);
        expect(deviceRepository.save).not.toHaveBeenCalled();
    });

    it('should update the ip of a known master when it changed', async () => {
        const master = CreateMasterModel('m1', 'AABBCCDDEEFF', '192.168.1.50');
        deviceRepository.getByType.mockResolvedValue([master]);
        jest.spyOn(service, 'scanNetwork').mockResolvedValue([{ ip: '192.168.1.77', port: 1092, hex: '', deviceId: 'AABBCCDDEEFF' }]);

        const created = await service.discover();

        expect(created).toEqual([]);
        expect(deviceRepository.save).toHaveBeenCalledWith(master);
        expect((master.config as MasterConfigModel).ipAddress).toBe('192.168.1.77');
    });

    it('should ignore responses without deviceId', async () => {
        jest.spyOn(service, 'scanNetwork').mockResolvedValue([{ ip: '192.168.1.60', port: 1092, hex: '00' }]);

        const created = await service.discover();

        expect(created).toEqual([]);
        expect(deviceRepository.save).not.toHaveBeenCalled();
    });
});
