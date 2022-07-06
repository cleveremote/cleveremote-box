// import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
// import { TaskService } from 'src/modules/task/domain/services/notification.service';

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
export class ConfigurationFetchUC {
    public constructor(private configurationService: ConfigurationService) { }

    public execute(): Promise<StructureModel> {
        return this.configurationService.getConfiguration();
    }
}