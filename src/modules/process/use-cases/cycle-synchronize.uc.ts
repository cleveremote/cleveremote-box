import { CycleModel } from '@process/domain/models/cycle.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class CycleSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeCycleModel: CycleModel): Promise<CycleModel> {
        return this.synchronizeService.synchronizeCycle(synchronizeCycleModel);
    }
}