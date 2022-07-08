import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocketIoClientProxyService } from 'src/common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { SocketIoClientProvider } from 'src/common/websocket/socket-io-client.provider';
import { ProcessService } from '@process/domain/services/execution.service';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ConfigurationController } from './controllers/configuration.controller';
import { ConfigurationRepository } from './repositories/configuration.repository';
import { ExecutionController } from './controllers/execution.controller';

@Module({
    imports: [
        ConfigModule.forRoot()
    ],
    controllers: [
        ConfigurationController,
        ExecutionController
    ],
    providers: [
        ConfigurationRepository,
        ConfigurationService,
        ProcessService,
        SocketIoClientProvider,
        SocketIoClientProxyService
    ]
})
export class ProcessModule { }