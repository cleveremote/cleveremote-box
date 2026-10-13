import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { InitService } from '@process/domain/services/init.service';
import { ProcessModule } from '@process/infrastructure/process.module';

// In the packaged SEA binary, process.execPath is the executable itself, so this
// resolves .env next to it regardless of the caller's cwd. In dev (`nest start`),
// process.execPath is the node binary, so this is false and the default cwd-relative
// .env lookup below still applies.
const execDirEnvPath = join(dirname(process.execPath), '.env');

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: existsSync(execDirEnvPath) ? execDirEnvPath : undefined
        }),
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