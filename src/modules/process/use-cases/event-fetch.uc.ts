import { EventModel } from '@process/domain/models/event.model';
import { CycleRunModel } from '@process/domain/models/cycle-history.model';
import { StructureService } from '@process/domain/services/configuration.service';

export class EventFetchUC {
    public constructor(private configurationService: StructureService) { }

    public execute(query: { deviceId?: string; startDate?: string; endDate?: string; lang?: string }): Promise<EventModel[] | CycleRunModel[]> {
        return this.configurationService.getEvents(query);
    }
}
