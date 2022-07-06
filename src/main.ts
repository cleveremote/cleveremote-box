import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { SocketIoClientProvider } from './common/websocket/socket-io-client.provider';
import { SocketIoClientStrategy } from './common/websocket/socket-io-client.strategy';

// eslint-disable-next-line @typescript-eslint/naming-convention
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    const appConfig = app.get<ConfigService>(ConfigService);
    const socketIoClientProvider = app.get<SocketIoClientProvider>(
        SocketIoClientProvider
    );

    app.connectMicroservice<MicroserviceOptions>({
        strategy: new SocketIoClientStrategy(socketIoClientProvider.getSocket())
    });

    await app.startAllMicroservices();
    await app.listen(appConfig.get('APP_PORT'));
}
bootstrap();
