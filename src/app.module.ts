import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessService } from '@process/domain/services/execution.service';
import { ProcessModule } from '@process/infrastructure/process.module';
import { lastValueFrom } from 'rxjs';
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
        return lastValueFrom(this.appService.resetAllModules());
        // .pipe(
        //     mergeMap(() => this.appService.loadCatalog()),
        //     mergeMap(() => this.appService.loadPromotions()),
        //     mergeMap(() => this.appService.loadShippings()),
        //     map(() => true)
        // )

    }
}