import { CycleModel } from '@process/domain/models/cycle.model';
import { SynchronizeCycleModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class ConfigurationPartialSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeCycleModel: SynchronizeCycleModel): Promise<CycleModel> {
        return this.synchronizeService.sychronizePartial(synchronizeCycleModel);
    }
}