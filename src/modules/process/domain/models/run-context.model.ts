import { randomUUID } from 'node:crypto';
import { EventConfirmationModel, EventOriginModel, EventSequencesSummary } from './event.model';

// une tentative d'execution d'un cycle, de la demande (confirmation / file / demarrage) jusqu'a sa fin :
// tous les events de cette tentative (cycle et sequences) portent le meme runId.
export class RunContextModel {
    public runId: string;
    public origin: EventOriginModel;
    public requestedAt: Date;
    public startedAt?: Date;
    public queuedAt?: Date;
    public confirmation?: EventConfirmationModel;
    public preempted: string[] = [];
    public sequences = new EventSequencesSummary();

    public static create(origin: EventOriginModel): RunContextModel {
        const run = new RunContextModel();
        run.runId = randomUUID();
        run.origin = origin;
        run.requestedAt = new Date();
        return run;
    }
}
