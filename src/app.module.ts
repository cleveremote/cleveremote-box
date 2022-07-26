import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessService } from '@process/domain/services/execution.service';
import { ProcessModule } from '@process/infrastructure/process.module';
import { lastValueFrom, map, mergeMap } from 'rxjs';
import { AppService } from './app.service';
@Module({
    imports: [ConfigModule.forRoot(), ProcessModule],
    controllers: [],
    providers: [AppService]
})
export class AppModule implements OnModuleInit {

    public constructor(
        private readonly appService: AppService
    ) { }

    public onModuleInit(): Promise<boolean> {
        const initializationProcess = this.appService.loadConfiguration().pipe(
            mergeMap(() => this.appService.resetAllModules()),
            map(() => true)
        );
        return lastValueFrom(initializationProcess);
    }
}