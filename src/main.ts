import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { SocketIoClientProvider } from './common/websocket/socket-io-client.provider';
import { SocketIoClientStrategy } from './common/websocket/socket-io-client.strategy';

// eslint-disable-next-line @typescript-eslint/naming-convention
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, { cors: true, bufferLogs: true });
    app.useLogger(app.get(Logger));
    const logger = app.get(Logger);
    // filet de securite : une rejection de promesse non geree (ex: sendMessage() fire-and-forget
    // sans .catch()) tue le process par defaut depuis Node 15 ; on log au lieu de crasher pour ne
    // pas faire tomber le controle de l'irrigation pour une erreur de synchro websocket non critique.
    process.on('unhandledRejection', (reason) => {
        logger.error({ err: reason }, 'unhandled promise rejection');
    });
    process.on('uncaughtException', (err) => {
        logger.error({ err }, 'uncaught exception');
    });
    const appConfig = app.get<ConfigService>(ConfigService);
    const socketIoClientProvider = app.get<SocketIoClientProvider>(
        SocketIoClientProvider
    );
    
    const socketIoClientProviderLocal = app.get<SocketIoClientProvider>(
        SocketIoClientProvider
    );
    app.connectMicroservice<MicroserviceOptions>({
        strategy: new SocketIoClientStrategy(socketIoClientProvider.getSocket(false),false)
    });

    app.connectMicroservice<MicroserviceOptions>({
        strategy: new SocketIoClientStrategy(socketIoClientProviderLocal.getSocket(true),true)
    });

    await app.startAllMicroservices();

    
    app.enableCors();
    app.get(Logger).log('🚀 Server listening on port 3000');
    await app.listen(appConfig.get('APP_PORT'));
}
bootstrap();
