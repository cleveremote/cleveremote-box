import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocketIoClientProxyService } from '../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { SocketIoClientProvider } from '../../../common/websocket/socket-io-client.provider';
import { ProcessService } from '@process/domain/services/execution.service';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ConfigurationController } from './controllers/configuration.controller';
import { ConfigurationRepository } from './repositories/configuration.repository';
import { ExecutionController } from './controllers/execution.controller';
import { InitService } from '@process/domain/services/init.service';

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
        SocketIoClientProxyService,
        InitService
    ],
    exports: [
        ProcessService,
        InitService
    ]
})
export class ProcessModule { }