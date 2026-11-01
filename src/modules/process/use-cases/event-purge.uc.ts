import { EventPurgeResultModel } from '@process/domain/models/event-purge.model';
import { StructureService } from '@process/domain/services/configuration.service';

export class EventPurgeUC {
    public constructor(private configurationService: StructureService) { }

    public execute(query: { deviceId?: string; before?: string }): Promise<EventPurgeResultModel> {
        return this.configurationService.purgeEvents(query);
    }
}
