import { EventModel } from '@process/domain/models/event.model';
import { StructureService } from '@process/domain/services/configuration.service';

export class EventFetchUC {
    public constructor(private configurationService: StructureService) { }

    public execute(query: { deviceId: string; startDate: string; endDate: string }): Promise<EventModel[]> {
        return this.configurationService.getEvents(query);
    }
}
