import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from 'src/modules/task/infrastructure/notification.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketIoClientProxyService } from './common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { SocketIoClientProvider } from './common/websocket/socket-io-client.provider';
import { SocketIoListener } from './socket-listener';

@Module({
  imports: [ConfigModule.forRoot(), NotificationModule],
  controllers: [AppController, SocketIoListener],
  providers: [AppService, SocketIoClientProvider, SocketIoClientProxyService],
})
export class AppModule { }
