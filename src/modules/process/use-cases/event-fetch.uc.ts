import { EventModel } from '@process/domain/models/event.model';
import { CycleRunModel, RunOutcome } from '@process/domain/models/cycle-history.model';
import { StructureService } from '@process/domain/services/configuration.service';

export type EventFetchQuery = {
    deviceId?: string; startDate?: string; endDate?: string; outcomes?: RunOutcome[]; limit?: number; lang?: string;
};

export class EventFetchUC {
    public constructor(private configurationService: StructureService) { }

    public execute(query: EventFetchQuery): Promise<EventModel[] | CycleRunModel[]> {
        return this.configurationService.getEvents(query);
    }
}
