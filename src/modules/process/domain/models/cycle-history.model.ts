import {
    ConditionCauseModel, ElementType, EventConfirmationModel, EventOriginModel, EventSequencesSummary, EventStopModel, ProcessEventData,
    ProcessEventKind
} from './event.model';

// etat d'un run d'apres son dernier event de cycle
export enum RunOutcome {
    RUNNING = 'RUNNING',
    WAITING_CONFIRMATION = 'WAITING_CONFIRMATION',
    QUEUED = 'QUEUED',
    ENDED = 'ENDED',
    CANCELLED = 'CANCELLED',
    REFUSED = 'REFUSED'
}

// selection des runs (box/fetch/events) ; elementIds absent : tous les cycles ; outcomes absent : tous les etats
export type RunIdsFilter = { elementIds?: string[]; startDate?: Date; endDate?: Date; outcomes?: RunOutcome[]; limit?: number };

export class RunTimelineEntryModel {
    public date: Date;
    public elementId: string;
    public elementType: ElementType;
    public kind?: ProcessEventKind;
    public name?: string;
    public message?: string;
    public data: ProcessEventData;
}

// une execution d'un cycle (tous les events d'un meme runId), resumee pour l'historique du front ;
// box/fetch/events renvoie ces runs du plus recent au plus ancien
export class CycleRunModel {
    public runId: string;
    public cycleId: string;
    public name?: string;
    public outcome: RunOutcome;
    public origin?: EventOriginModel;
    public parentRunId?: string; // run du Group / cycle pilote (origin.refRunId)
    public confirmation?: EventConfirmationModel;
    public stop?: EventStopModel;
    public requestedAt: Date; // premier event du run
    public startedAt?: Date;
    public endedAt?: Date;
    public realDuration?: number;
    public plannedDuration?: number;
    public sequences?: EventSequencesSummary;
    public preempted?: string[];
    public conditions?: string[]; // REFUSED : conditions fausses
    public conditionCauses?: ConditionCauseModel[];
    public message?: string; // message du dernier event de cycle
    public timeline: RunTimelineEntryModel[] = [];
}
