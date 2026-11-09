import { InverterModel } from '@process/domain/models/inverter.model';
import { SynchronizeInverterModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Réglages d'un élément variateur
 *
 * Nom, mode par défaut (hors séquence), délai de retour au mode par défaut et valeurs imposées des paramètres
 *
 * @include SynchronizeService.synchronizeInverter
 *
*/
export class InverterSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeInverterModel: SynchronizeInverterModel): Promise<InverterModel> {
        return this.synchronizeService.synchronizeInverter(synchronizeInverterModel);
    }
}
