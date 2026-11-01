import {
    ElementType, EventConfirmationModel, EventModel, EventOriginModel, EventSequencesSummary, EventStopModel, ProcessEventData,
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

export class RunTimelineEntryModel {
    public date: Date;
    public elementId: string;
    public elementType: ElementType;
    public kind?: ProcessEventKind;
    public name?: string;
    public message?: string;
    public data: ProcessEventData;
}

// une execution d'un cycle (tous les events d'un meme runId), resumee pour l'historique du front
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
    public message?: string; // message du dernier event de cycle
    public timeline: RunTimelineEntryModel[] = [];
}

// reponse de box/fetch/events pour un cycle : runs du plus recent au plus ancien ; legacy = events
// sans runId (anterieurs au journal, reset au boot d'un element deja arrete), ordre chronologique
export class CycleHistoryModel {
    public cycleId: string;
    public runs: CycleRunModel[];
    public legacy: EventModel[];
}
