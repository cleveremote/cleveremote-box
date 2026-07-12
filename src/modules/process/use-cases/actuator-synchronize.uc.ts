import { ActuatorModel } from '@process/domain/models/actuator.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregistrement d'une liste d'actionneurs (RPi ou COM)
 *
 * Permet la synchronisation et l'enregistrement d'une liste d'actionneurs, quel que soit leur type
 *
 * @include SynchronizeService.synchronizeActuatorList
 *
*/
export class ActuatorSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeActuatorModels: ActuatorModel[]): Promise<ActuatorModel[]> {
        return this.synchronizeService.synchronizeActuatorList(synchronizeActuatorModels);
    }
}
