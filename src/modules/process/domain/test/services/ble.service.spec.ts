import { BleService } from '@process/domain/services/ble.service';
import { AuthenticationService } from '@process/domain/services/authentication.service';

// BleService pilote un vrai peripherique Bluetooth (via hci-socket/ble-host) et le
// gestionnaire reseau systeme (via node-network-manager, qui execute de vraies commandes
// nmcli/wpa) : comme pour les autres services materiels de cette suite, ces trois modules sont
// entierement mockes pour qu'aucun test ne touche le Bluetooth ou le Wi-Fi reels de ce boitier.
// Les mocks sont construits *a l'interieur* des factories jest.mock (elles-memes hoistees au
// sommet du fichier par jest/ts-jest, avant toute const de module) puis recuperes apres coup via
// des proprietes internes exposees sur le module mocke, pour eviter tout probleme de TDZ.
jest.mock('ble-host', () => {
    const gattDb = { setDeviceName: jest.fn(), addServices: jest.fn() };
    const manager = { gattDb, setAdvertisingData: jest.fn(), startAdvertising: jest.fn() };
    const create = jest.fn((transport: unknown, options: unknown, cb: (err: Error, mgr: unknown) => void) => cb(null, manager));
    const advBuilder = {
        addFlags: jest.fn().mockReturnThis(),
        addLocalName: jest.fn().mockReturnThis(),
        add128BitServiceUUIDs: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue(Buffer.from('adv-data'))
    };
    return {
        BleManager: { create },
        AdvertisingDataBuilder: jest.fn().mockImplementation(() => advBuilder),
        HciErrors: { SUCCESS: 0 },
        AttErrors: { SUCCESS: 0, WRITE_NOT_PERMITTED: 1, UNLIKELY_ERROR: 2 },
        __mockGattDb: gattDb,
        __mockManager: manager,
        __mockCreate: create,
        __mockAdvBuilder: advBuilder
    };
});

jest.mock('hci-socket', () => jest.fn().mockImplementation(() => ({})));

jest.mock('node-network-manager', () => ({
    getConnectionProfilesList: jest.fn(),
    getWifiList: jest.fn(),
    wifiConnect: jest.fn()
}));

jest.mock('fs', () => ({ ...(jest.requireActual('fs') as object), readFileSync: jest.fn().mockReturnValue('device-serial-42') }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bleHostMock = require('ble-host');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HciSocketMock = require('hci-socket');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockNetwork = require('node-network-manager');

const mockGattDb = bleHostMock.__mockGattDb as { setDeviceName: jest.Mock; addServices: jest.Mock };
const mockManager = bleHostMock.__mockManager as { setAdvertisingData: jest.Mock; startAdvertising: jest.Mock };
const mockBleManagerCreate = bleHostMock.__mockCreate as jest.Mock;
const mockAdvBuilder = bleHostMock.__mockAdvBuilder as { addLocalName: jest.Mock };

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// Extrait, depuis les appels mockes a addServices, les callbacks onRead/onWrite/onSubscriptionChange
// definis en fermeture dans BleService.initialize(), pour pouvoir les invoquer directement.
interface MockCharacteristic {
    onRead?: (...args: unknown[]) => unknown;
    onWrite?: (...args: unknown[]) => unknown;
    onSubscriptionChange?: (...args: unknown[]) => unknown;
    notify?: jest.Mock;
}

function GetCharacteristic(uuidSuffix: string): MockCharacteristic {
    const services = mockGattDb.addServices.mock.calls[0][0] as { characteristics: { uuid: string }[] }[];
    return services[0].characteristics.find((c) => c.uuid.endsWith(uuidSuffix)) as never;
}

describe('BleService (hci-socket/ble-host/node-network-manager mocked)', () => {
    let authenticationService: { checkPassword: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: BleService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockBleManagerCreate.mockImplementation((transport: unknown, options: unknown, cb: (err: Error, mgr: unknown) => void) => {
            cb(null, mockManager);
        });
        (HciSocketMock as jest.Mock).mockImplementation(() => ({}));
        authenticationService = { checkPassword: jest.fn() };
        logger = CreateLoggerMock();

        service = new BleService(
            authenticationService as unknown as AuthenticationService,
            logger as never
        );
    });

    describe('initialize', () => {
        it('should log and return without throwing when the Bluetooth transport is unavailable', async () => {
            (HciSocketMock as jest.Mock).mockImplementation(() => { throw new Error('no bluetooth adapter'); });

            await expect(service.initialize()).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ err: 'no bluetooth adapter' }),
                'BleService: could not initialize HciSocket (Bluetooth unavailable)'
            );
            expect(mockBleManagerCreate).not.toHaveBeenCalled();
        });

        it('should log and return when BleManager creation fails', async () => {
            mockBleManagerCreate.mockImplementation((transport: unknown, options: unknown, cb: (err: Error, mgr: unknown) => void) => {
                cb(new Error('manager creation failed'), null);
            });

            await service.initialize();

            expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'BleManager creation failed');
            expect(mockGattDb.setDeviceName).not.toHaveBeenCalled();
        });

        it('should set up the GATT server and start advertising on success', async () => {
            await service.initialize();

            expect(mockGattDb.setDeviceName).toHaveBeenCalledWith('clv-ble');
            expect(mockGattDb.addServices).toHaveBeenCalled();
            expect(mockAdvBuilder.addLocalName).toHaveBeenCalledWith(true, 'device-serial-42');
            expect(mockManager.setAdvertisingData).toHaveBeenCalledWith(Buffer.from('adv-data'));
            expect(mockManager.startAdvertising).toHaveBeenCalledWith({}, expect.any(Function));
        });

        it('should retry advertising after a delay when startAdvertising reports a non-success status', async () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0 as never);

            await service.initialize();
            const connectCallback = mockManager.startAdvertising.mock.calls[0][1] as (status: number, conn: unknown) => void;
            connectCallback(1, null);

            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
            setTimeoutSpy.mockRestore();
        });

        it('should restart advertising when the connection disconnects', async () => {
            await service.initialize();
            const connectCallback = mockManager.startAdvertising.mock.calls[0][1] as (status: number, conn: { on: jest.Mock }) => void;
            const conn = { on: jest.fn() };

            connectCallback(0, conn);

            expect(conn.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
            mockManager.startAdvertising.mockClear();
            const disconnectHandler = conn.on.mock.calls[0][1] as () => void;
            disconnectHandler();
            expect(mockManager.startAdvertising).toHaveBeenCalled();
        });

        it('should serve the merged wifi network list on a read request', async () => {
            mockNetwork.getConnectionProfilesList.mockResolvedValue([{ TYPE: 'wifi', NAME: 'home-wifi' }, { TYPE: 'ethernet', NAME: 'eth0' }]);
            mockNetwork.getWifiList.mockResolvedValue([
                { SSID: 'home-wifi', inUseBoolean: true },
                { SSID: 'neighbor-wifi', inUseBoolean: false }
            ]);
            await service.initialize();
            const characteristic = GetCharacteristic('666666666668');
            const callback = jest.fn();

            await characteristic.onRead(null, callback);

            expect(callback.mock.calls[0][0]).toEqual(0);
            expect(JSON.parse(callback.mock.calls[0][1] as string)).toEqual([
                { name: 'home-wifi', isConfigured: true, 'in-use': true },
                { name: 'neighbor-wifi', 'in-use': false }
            ]);
        });

        it('should mark a duplicate SSID as in-use when a later scan entry reports it in use', async () => {
            mockNetwork.getConnectionProfilesList.mockResolvedValue([]);
            mockNetwork.getWifiList.mockResolvedValue([
                { SSID: 'dup-wifi', inUseBoolean: false },
                { SSID: 'dup-wifi', inUseBoolean: true }
            ]);
            await service.initialize();
            const characteristic = GetCharacteristic('666666666668');
            const callback = jest.fn();

            await characteristic.onRead(null, callback);

            expect(callback.mock.calls[0][0]).toEqual(0);
            expect(JSON.parse(callback.mock.calls[0][1] as string)).toEqual([{ name: 'dup-wifi', 'in-use': true }]);
        });

        it('should report an error result when fetching wifi networks fails', async () => {
            mockNetwork.getConnectionProfilesList.mockRejectedValue(new Error('nmcli unavailable'));
            await service.initialize();
            const characteristic = GetCharacteristic('666666666668');
            const callback = jest.fn();

            await characteristic.onRead(null, callback);

            expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: 'nmcli unavailable' }), 'BleService: getWifiNetworks failed');
            expect(callback).toHaveBeenCalledWith(2, JSON.stringify([]));
        });

        it('should fall back to String(err) when fetching wifi networks rejects with a non-Error value', async () => {
            mockNetwork.getConnectionProfilesList.mockRejectedValue('plain string reason');
            await service.initialize();
            const characteristic = GetCharacteristic('666666666668');
            const callback = jest.fn();

            await characteristic.onRead(null, callback);

            expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: 'plain string reason' }), 'BleService: getWifiNetworks failed');
            expect(callback).toHaveBeenCalledWith(2, JSON.stringify([]));
        });

        it('should fall back to String(err) when fetching wifi networks rejects with undefined', async () => {
            mockNetwork.getConnectionProfilesList.mockRejectedValue(undefined);
            await service.initialize();
            const characteristic = GetCharacteristic('666666666668');
            const callback = jest.fn();

            await characteristic.onRead(null, callback);

            expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: 'undefined' }), 'BleService: getWifiNetworks failed');
            expect(callback).toHaveBeenCalledWith(2, JSON.stringify([]));
        });

        it('should connect to wifi and reply success when the write payload has a valid password', async () => {
            authenticationService.checkPassword.mockResolvedValue(true);
            await service.initialize();
            const characteristic = GetCharacteristic('666666666669');
            const callback = jest.fn();
            const payload = Buffer.from(JSON.stringify({ ssid: 'home-wifi', psk: 'wifi-pass', password: 'device-password' }));

            await characteristic.onWrite(null, true, payload, callback);

            expect(mockNetwork.wifiConnect).toHaveBeenCalledWith('home-wifi', 'wifi-pass');
            expect(callback).toHaveBeenCalledWith(0);
        });

        it('should reject the write and never touch the network when the password is invalid', async () => {
            authenticationService.checkPassword.mockResolvedValue(false);
            await service.initialize();
            const characteristic = GetCharacteristic('666666666669');
            const callback = jest.fn();
            const payload = Buffer.from(JSON.stringify({ ssid: 'home-wifi', psk: 'wifi-pass', password: 'wrong-password' }));

            await characteristic.onWrite(null, true, payload, callback);

            expect(mockNetwork.wifiConnect).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(1);
        });

        it('should report an error result when the write payload cannot be parsed', async () => {
            await service.initialize();
            const characteristic = GetCharacteristic('666666666669');
            const callback = jest.fn();

            await characteristic.onWrite(null, true, Buffer.from('not-json'), callback);

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ err: expect.any(String) }),
                'BleService: buildContenteConfigFile failed'
            );
            expect(callback).toHaveBeenCalledWith(2);
        });

        it('should fall back to String(err) when the write payload handling rejects with a non-Error value', async () => {
            authenticationService.checkPassword.mockRejectedValue('plain string reason');
            await service.initialize();
            const characteristic = GetCharacteristic('666666666669');
            const callback = jest.fn();
            const payload = Buffer.from(JSON.stringify({ ssid: 'home-wifi', psk: 'wifi-pass', password: 'device-password' }));

            await characteristic.onWrite(null, true, payload, callback);

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ err: 'plain string reason' }),
                'BleService: buildContenteConfigFile failed'
            );
            expect(callback).toHaveBeenCalledWith(2);
        });

        it('should fall back to String(err) when the write payload handling rejects with undefined', async () => {
            authenticationService.checkPassword.mockRejectedValue(undefined);
            await service.initialize();
            const characteristic = GetCharacteristic('666666666669');
            const callback = jest.fn();
            const payload = Buffer.from(JSON.stringify({ ssid: 'home-wifi', psk: 'wifi-pass', password: 'device-password' }));

            await characteristic.onWrite(null, true, payload, callback);

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ err: 'undefined' }),
                'BleService: buildContenteConfigFile failed'
            );
            expect(callback).toHaveBeenCalledWith(2);
        });

        it('should send a notification once a client subscribes to the notify characteristic', async () => {
            await service.initialize();
            const characteristic = GetCharacteristic('66666666666A');
            characteristic.notify = jest.fn();
            const connection = {};

            characteristic.onSubscriptionChange(connection, true, false, false);

            expect(characteristic.notify).toHaveBeenCalledWith(connection, 'Sample notification');
        });

        it('should not notify when a client unsubscribes', async () => {
            await service.initialize();
            const characteristic = GetCharacteristic('66666666666A');
            characteristic.notify = jest.fn();

            characteristic.onSubscriptionChange({}, false, false, false);

            expect(characteristic.notify).not.toHaveBeenCalled();
        });
    });
});
