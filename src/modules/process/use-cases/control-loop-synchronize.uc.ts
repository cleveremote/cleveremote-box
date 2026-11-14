import { ControlLoopModel } from '@process/domain/models/control-loop.model';
import { SynchronizeControlLoopModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregistrement d'une boucle de régulation (ControlLoop)
 *
 * Permet la synchronisation et l'enregistrement de la régulation d'un actionneur CTRL
 *
 * @include SynchronizeService.synchronizeControlLoop
 *
*/
export class ControlLoopSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeControlLoopModel: SynchronizeControlLoopModel): Promise<ControlLoopModel> {
        return this.synchronizeService.synchronizeControlLoop(synchronizeControlLoopModel);
    }
}
