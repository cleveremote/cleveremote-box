import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './common/websocket/socket-io.adapter';

function getHttpsOptions() {
    const certPath = process.env.SSL_CERT_PATH;
    const keyPath = process.env.SSL_KEY_PATH;
    if (certPath && keyPath) {
        return {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath),
        };
    }
    return undefined;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
async function bootstrap(): Promise<void> {
    const httpsOptions = getHttpsOptions();
    const app = await NestFactory.create(AppModule, { httpsOptions, cors: true, bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.useWebSocketAdapter(new SocketIoAdapter(app));
    const appConfig = app.get<ConfigService>(ConfigService);

    app.enableCors();
    app.get(Logger).log('🚀 Server listening on port 3000');
    await app.listen(appConfig.get('APP_PORT'));
}
bootstrap();
