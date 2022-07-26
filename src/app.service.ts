import { Injectable, Logger } from '@nestjs/common';
import { ProcessService } from '@process/domain/services/execution.service';
import { InitService } from '@process/domain/services/init.service';
import { catchError, from, map, Observable, tap } from 'rxjs';

@Injectable()
export class AppService {
    public constructor(
        private readonly initService: InitService
    ) { }

    public resetAllModules(): Observable<any> {
        Logger.log('Start initialize processes...', 'initialization');
        return from(this.initService.resetAllModules()).pipe(
            map(() => {
                Logger.log('processes initialized', 'initialization');
                return true;
            }
            ),
            catchError((err) => {
                Logger.error(`! initialize processes KO ${String(err)} `);
                return err;
            }));
    }

    public loadConfiguration(): Observable<any> {
        Logger.log('Start loading configuration...', 'initialization');
        return from(this.initService.resetAllModules()).pipe(
            map(() => {
                Logger.log('configuration loaded', 'initialization');
                return true;
            }
            ),
            catchError((err) => {
                Logger.error(`! loading configuration KO ${String(err)} `);
                return err;
            }));
    }

}
