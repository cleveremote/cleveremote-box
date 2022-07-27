import { Injectable, Logger } from '@nestjs/common';
import { InitService } from '@process/domain/services/init.service';
import { catchError, from, map, Observable, of } from 'rxjs';

@Injectable()
export class AppService {
    public constructor(
        private readonly initService: InitService
    ) { }

    public resetAllModules(): Observable<boolean> {
        Logger.log('Start initialize processes...', 'initialization');
        return from(this.initService.resetAllModules()).pipe(
            map(() => {
                Logger.log('processes initialized', 'initialization');
                return true;
            }
            ),
            catchError((err) => {
                Logger.error(`! initialize processes KO ${String(err)} `);
                return of(false);
            }));
    }

    public loadConfiguration(): Observable<boolean> {
        Logger.log('Start loading configuration...', 'initialization');
        return from(this.initService.getConfiguration()).pipe(
            map(() => {
                Logger.log('configuration loaded', 'initialization');
                return true;
            }
            ),
            catchError((err) => {
                Logger.error(`! loading configuration KO ${String(err)} `);
                return of(false);
            }));
    }

}
