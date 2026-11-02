import { CycleHistoryModel, CycleRunModel, RunOutcome } from '@process/domain/models/cycle-history.model';
import { EventModel, ProcessEventData, ProcessEventKind } from '@process/domain/models/event.model';

const OUTCOME_BY_KIND: Partial<Record<ProcessEventKind, RunOutcome>> = {
    [ProcessEventKind.START_REFUSED]: RunOutcome.REFUSED,
    [ProcessEventKind.CONFIRMATION_REQUESTED]: RunOutcome.WAITING_CONFIRMATION,
    [ProcessEventKind.CYCLE_QUEUED]: RunOutcome.QUEUED,
    [ProcessEventKind.CYCLE_STARTED]: RunOutcome.RUNNING,
    [ProcessEventKind.CYCLE_ENDED]: RunOutcome.ENDED,
    [ProcessEventKind.CYCLE_CANCELLED]: RunOutcome.CANCELLED
};

const Time = (event: EventModel): number => new Date(event.date).getTime();

// champs portes par tous les events du cycle : le dernier connu l'emporte
function ApplyRunHeader(run: CycleRunModel, data: ProcessEventData): void {
    run.name = data.name ?? run.name;
    run.origin = data.origin ?? run.origin;
    run.parentRunId = data.origin?.refRunId ?? run.parentRunId;
    run.confirmation = data.confirmation ?? run.confirmation;
    run.message = data.message ?? run.message;
    run.outcome = OUTCOME_BY_KIND[data.kind] ?? run.outcome;
}

// event du cycle lui-meme : met a jour le resume du run
function ApplyCycleEvent(run: CycleRunModel, event: EventModel, data: ProcessEventData): void {
    ApplyRunHeader(run, data);
    if (data.kind === ProcessEventKind.CYCLE_STARTED) {
        run.startedAt = event.date;
        run.plannedDuration = data.plannedDuration;
        run.preempted = data.preempted;
    } else if (data.kind === ProcessEventKind.CYCLE_ENDED || data.kind === ProcessEventKind.CYCLE_CANCELLED) {
        run.stop = data.stop;
        run.endedAt = data.endedAt ?? event.date;
        run.realDuration = data.realDuration;
        run.sequences = data.sequences ?? run.sequences;
        run.plannedDuration = data.plannedDuration ?? run.plannedDuration;
    } else if (data.kind === ProcessEventKind.START_REFUSED) {
        run.conditions = data.conditions;
        run.conditionCauses = data.conditionCauses;
    }
}

// regroupe les events d'un cycle et de ses sequences par runId
export function BuildCycleHistory(cycleId: string, events: EventModel[]): CycleHistoryModel {
    const runs = new Map<string, CycleRunModel>();
    const legacy: EventModel[] = [];
    for (const event of [...events].sort((a, b) => Time(a) - Time(b))) {
        const data = event.additionalData as ProcessEventData;
        if (!data?.runId) {
            legacy.push(event);
            continue;
        }
        let run = runs.get(data.runId);
        if (!run) {
            run = Object.assign(new CycleRunModel(), { runId: data.runId, cycleId, outcome: RunOutcome.RUNNING, requestedAt: event.date });
            runs.set(data.runId, run);
        }
        run.timeline.push({
            date: event.date, elementId: event.elementId, elementType: event.elementType,
            kind: data.kind, name: data.name, message: data.message, data
        });
        if (event.elementId === cycleId) {
            ApplyCycleEvent(run, event, data);
        }
    }
    const sortedRuns = [...runs.values()].sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    return { cycleId, runs: sortedRuns, legacy };
}
