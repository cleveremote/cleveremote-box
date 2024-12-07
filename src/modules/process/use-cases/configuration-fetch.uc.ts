import { StructureModel } from "@process/domain/models/structure.model";
import { StructureService } from "@process/domain/services/configuration.service";

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class ConfigurationFetchUC {
    public constructor(private configurationService: StructureService) { }

    public execute(): Promise<StructureModel> {
        return this.configurationService.getConfigurationWithStatus();
    }
}