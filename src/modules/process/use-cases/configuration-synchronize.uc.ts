import { StructureModel } from '@process/domain/models/structure.model';
import { ConfigurationService } from '@process/domain/services/configuration.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class ConfigurationSynchronizeUC {
    public constructor(private configurationService: ConfigurationService) { }

    public execute(structure: StructureModel): Promise<StructureModel> {
        return this.configurationService.synchronize(structure);
    }
}