import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SocketIoClientProvider } from './socket-io-client.provider';

// getSocket()/_connect() ouvrent une vraie connexion socket.io vers un serveur distant reel
// (SOCKET_SERVER/SOCKET_SERVER_LOCAL de .env, api.cleversystech.com) : comme pour les autres
// dependances reseau/materielles de cette suite, 'socket.io-client' est entierement mocke pour
// qu'aucun test n'ouvre de connexion reseau reelle (io() a une reconnexion automatique avec de
// vrais timers, source probable de fuites de type "worker process has failed to exit").
const mockSocket = { on: jest.fn(), emit: jest.fn(), disconnect: jest.fn() };
const ioMock = jest.fn().mockReturnValue(mockSocket);
jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => ioMock(...args) }));
jest.mock('fs', () => ({ ...(jest.requireActual('fs') as object), readFileSync: jest.fn().mockReturnValue('device-serial-42') }));

describe('SocketIoClientProvider (socket.io-client/fs mocked)', () => {
    let provider: SocketIoClientProvider;
    let configService: { get: jest.Mock };

    beforeEach(async () => {
        jest.clearAllMocks();
        ioMock.mockReturnValue(mockSocket);
        configService = {
            get: jest.fn((key: string) => (key === 'SOCKET_SERVER_LOCAL' ? 'http://local-test-server:5001' : 'https://remote-test-server:443'))
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [SocketIoClientProvider, { provide: ConfigService, useValue: configService }]
        }).compile();

        provider = module.get<SocketIoClientProvider>(SocketIoClientProvider);
    });

    it('should be defined', () => {
        expect(provider).toBeDefined();
    });

    it('should read the device unique id file as utf8', () => {
        expect(provider._getSerial()).toEqual('device-serial-42');
    });

    it('should connect to the remote server using SOCKET_SERVER when not local', () => {
        const socket = provider.getSocket(false);

        expect(socket).toBe(mockSocket);
        expect(ioMock).toHaveBeenCalledWith(
            'https://remote-test-server:443',
            expect.objectContaining({ extraHeaders: { boxId: 'device-serial-42', type: 'box' } })
        );
    });

    it('should connect to the local server using SOCKET_SERVER_LOCAL when local', () => {
        provider.getSocket(true);

        expect(ioMock).toHaveBeenCalledWith('http://local-test-server:5001', expect.anything());
    });

    it('should reuse the same cached socket on subsequent calls instead of reconnecting', () => {
        const first = provider.getSocket(false);
        const second = provider.getSocket(false);

        expect(second).toBe(first);
        expect(ioMock).toHaveBeenCalledTimes(1);
    });

    it('should keep the local and remote sockets independent from each other', () => {
        const remoteSocket = { ...mockSocket, id: 'remote' };
        const localSocket = { ...mockSocket, id: 'local' };
        ioMock.mockReturnValueOnce(remoteSocket).mockReturnValueOnce(localSocket);

        const remote = provider.getSocket(false);
        const local = provider.getSocket(true);

        expect(remote).not.toBe(local);
        expect(ioMock).toHaveBeenCalledTimes(2);
    });
});
