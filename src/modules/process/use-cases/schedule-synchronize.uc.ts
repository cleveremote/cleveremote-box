import { CycleModel } from '@process/domain/models/cycle.model';
import { SynchronizeScheduleModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class ScheduleSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeCycleModel: SynchronizeScheduleModel): Promise<CycleModel> {
        return this.synchronizeService.sychronizeSchedule(synchronizeCycleModel);
    }
}