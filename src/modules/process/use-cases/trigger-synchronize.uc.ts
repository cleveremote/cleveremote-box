import { CycleModel } from '@process/domain/models/cycle.model';
import { SynchronizeScheduleModel, SynchronizeTriggerModel } from '@process/domain/models/synchronize.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class TriggerSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeTriggerModel: TriggerModel): Promise<TriggerModel> {
        return this.synchronizeService.synchronizeTrigger(synchronizeTriggerModel);
    }
}