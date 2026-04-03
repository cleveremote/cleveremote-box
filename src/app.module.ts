import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { InitService } from '@process/domain/services/init.service';
import { ProcessModule } from '@process/infrastructure/process.module';


@Module({
    imports: [
        ConfigModule.forRoot(),
        LoggerModule.forRoot({
            pinoHttp: {
                transport:
                    process.env.NODE_ENV !== 'production'
                        ? { target: 'pino-pretty', options: { singleLine: true } }
                        : undefined,
                level: process.env.LOG_LEVEL ?? 'info'
            }
        }),
        ProcessModule
    ],
    controllers: [],
    providers: []
})
export class AppModule implements OnModuleInit {

    public constructor(
        private readonly initService: InitService
    ) { }

    public onModuleInit(): Promise<void> {
        return this.initService.initialize();
    }
}