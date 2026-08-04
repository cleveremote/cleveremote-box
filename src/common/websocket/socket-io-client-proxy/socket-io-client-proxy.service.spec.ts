import { Test, TestingModule } from '@nestjs/testing';
import { SocketIoClientProvider } from '../socket-io-client.provider';
import { SocketIoClientProxyService } from './socket-io-client-proxy.service';

describe('SocketIoClientProxyService', () => {
    let service: SocketIoClientProxyService;
    let mockSocket: { emit: jest.Mock };
    let socketProvider: { getSocket: jest.Mock };

    beforeEach(async () => {
        mockSocket = { emit: jest.fn() };
        socketProvider = { getSocket: jest.fn().mockReturnValue(mockSocket) };
        const module: TestingModule = await Test.createTestingModule({
            providers: [SocketIoClientProxyService, { provide: SocketIoClientProvider, useValue: socketProvider }]
        }).compile();

        service = module.get<SocketIoClientProxyService>(SocketIoClientProxyService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should connect', () => {
        expect(service.connect()).toBeDefined();
    });

    it('should close', () => {
        expect(service.close()).toBeDefined();
    });

    it('should dispatch', () => {
        expect(service.dispatchEvent({ pattern: 'test-with-no-response', data: 'Ohayo' })).toBeDefined();
    });

    it('should unwrap and return the underlying socket provider', () => {
        expect(service.unwrap()).toBe(socketProvider);
    });

    describe('sendMessage / _emitMessage', () => {
        it('should resolve with the response received on the requested socket (local or remote)', async () => {
            mockSocket.emit.mockImplementation((pattern: string, data: unknown, callback: (res: unknown) => void) => callback('ack'));

            const response = await service.sendMessage({ pattern: 'box/synchronize/configuration', data: 'payload' }, true);

            expect(response).toEqual('ack');
            expect(socketProvider.getSocket).toHaveBeenCalledWith(true);
            expect(mockSocket.emit).toHaveBeenCalledWith('box/synchronize/configuration', 'payload', expect.any(Function));
        });

        it('should reject when the socket callback receives an empty response', async () => {
            mockSocket.emit.mockImplementation((pattern: string, data: unknown, callback: (res: unknown) => void) => callback(undefined));

            await expect(service.sendMessage({ pattern: 'box/synchronize/configuration', data: 'payload' }, false)).rejects.toEqual('err');
            expect(socketProvider.getSocket).toHaveBeenCalledWith(false);
        });
    });
});
