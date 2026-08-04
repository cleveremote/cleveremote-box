import { ActuatorModel } from '@process/domain/models/actuator.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregistrement d'une vanne (Valve)
 *
 * Permet la synchronisation et l'enregistrement d'une vanne
 *
 * @include SynchronizeService.synchronizeValve
 *
*/
export class ValveSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeValveModel: ActuatorModel): Promise<ActuatorModel> {
        return this.synchronizeService.synchronizeValve(synchronizeValveModel);
    }
}
