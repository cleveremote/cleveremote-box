import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SocketIoClientProvider } from './socket-io-client.provider';
import { SocketIoClientStrategy } from './socket-io-client.strategy';

let provider: SocketIoClientProvider;
beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
        imports: [ConfigModule.forRoot()],
        providers: [SocketIoClientProvider]
    }).compile();

    provider = module.get<SocketIoClientProvider>(SocketIoClientProvider);
});

describe('SocketIoClientStrategy', () => {
    it('should be defined', () => {
        expect(new SocketIoClientStrategy(provider.getSocket())).toBeDefined();
    });
});

describe('SocketIoClientStrategy & reuses provider.getSocket()', () => {
    it('should be defined', () => {
        provider.getSocket();
        expect(new SocketIoClientStrategy(provider.getSocket())).toBeDefined();
    });
});