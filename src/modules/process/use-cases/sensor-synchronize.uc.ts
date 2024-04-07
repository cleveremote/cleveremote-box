import { CycleModel } from '@process/domain/models/cycle.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { SynchronizeScheduleModel, SynchronizeSensorModel, SynchronizeTriggerModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class SensorSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeSensorModel: SynchronizeSensorModel): Promise<SensorModel> {
        return this.synchronizeService.sychronizeSensor(synchronizeSensorModel);
    }
}