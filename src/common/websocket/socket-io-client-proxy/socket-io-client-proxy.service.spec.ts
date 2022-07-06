import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SocketIoClientProvider } from '../socket-io-client.provider';
import { SocketIoClientProxyService } from './socket-io-client-proxy.service';

describe('SocketIoClientProxyService', () => {
    let service: SocketIoClientProxyService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule.forRoot()],
            providers: [SocketIoClientProxyService, SocketIoClientProvider]
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

    it('should dispatch', async () => {
        await service.sendMessage({ pattern: 'greeting-from-client', data: 'Ohayo' })
            .then(data => { console.log(data); })
            .catch(err => { console.log(err); });
    });

    it('should dispatch timeout', async () => {
        await service.dispatchEvent({ pattern: 'greeting-from-client', data: 'Ohayo' })
            .then(data => { console.log(data); })
            .catch(err => { console.log(err); });
    });
});