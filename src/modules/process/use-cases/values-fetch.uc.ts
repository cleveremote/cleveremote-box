import { ProcessValueModel } from '@process/domain/models/proccess-value.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ValueModel } from '@process/domain/models/value.model';
import { StructureService } from '@process/domain/services/configuration.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class ValuesFetchUC {
    public constructor(private configurationService: StructureService) { }

    public execute(type: string): Promise<ProcessValueModel[] | SensorValueModel[] | ValueModel> {
        return this.configurationService.getStatus(type);
    }
}