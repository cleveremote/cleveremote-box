import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InitService } from '@process/domain/services/init.service';
import { ProcessModule } from '@process/infrastructure/process.module';
@Module({
    imports: [ConfigModule.forRoot(), ProcessModule],
    controllers: [],
    providers: []
})
export class AppModule implements OnModuleInit {

    public constructor(
        private readonly initService: InitService
    ) { }

    public onModuleInit(): Promise<boolean> {
        return this.initService.initialize();
    }
}