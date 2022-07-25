import { Injectable, Logger } from '@nestjs/common';
import { ProcessService } from '@process/domain/services/execution.service';
import { catchError, from, map, Observable, tap } from 'rxjs';

@Injectable()
export class AppService {
    public constructor(
        private readonly processService: ProcessService
    ) { }

    public resetAllModules(): Observable<any> {
        Logger.log('Start reset modules...', 'modules');
        return from(this.processService.resetAllModules()).pipe(
            map(() => {
                Logger.log('reset all modules', 'modules');
                return true;
            }
            ),
            catchError((err) => {
                Logger.error(`! reset modules KO ${String(err)} `);
                return err;
            }));
    }

}
