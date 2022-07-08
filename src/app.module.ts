import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessModule } from '@process/infrastructure/process.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
@Module({
    imports: [ConfigModule.forRoot(), ProcessModule],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule { }
