// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   await app.listen(3000);
// }





// bootstrap();

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { SocketIoClientProvider } from './common/websocket/socket-io-client.provider';
import { SocketIoClientStrategy } from './common/websocket/socket-io-client.strategy';
// import { SocketIoClientStrategy } from './socket-io-client.strategy';
// import { SocketIoClientProvider } from './socket-io-client.provider';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appConfig = app.get<ConfigService>(ConfigService);
  const socketIoClientProvider = app.get<SocketIoClientProvider>(
    SocketIoClientProvider,
  );

  app.connectMicroservice<MicroserviceOptions>({
    strategy: new SocketIoClientStrategy(socketIoClientProvider.getSocket()),
  });

  await app.startAllMicroservices();
  await app.listen(appConfig.get('APP_PORT'));
}
bootstrap();
