import {
    ConditionCauseModel, EventOriginModel, EventStopModel, ProcessEventData, ProcessEventKind
} from '@process/domain/models/event.model';
import { ConfirmationConflictModel } from '@process/domain/models/confirmation-request.model';

// Phrases du journal d'execution dans une langue (cf. process-event-message.util)
export interface EventTexts {
    quote(name: string | undefined): string;
    origin(origin: EventOriginModel): string;
    stop(stop: EventStopModel | undefined): string;
    condition(cause: ConditionCauseModel): string;
    kinds: Record<ProcessEventKind, (data: ProcessEventData, name: string) => string>;
}

// 45 s / 2 min 13 s / 15 min / 1 h 05 min (unites techniques, identiques dans toutes les langues)
export function FormatDuration(ms: number | undefined): string {
    if (ms === undefined || ms === null || isNaN(ms)) { return '?'; }
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) { return `${hours} h ${String(minutes).padStart(2, '0')} min`; }
    if (minutes) { return seconds ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${minutes} min`; }
    return `${seconds} s`;
}

// conditions fausses : structurees si presentes (rendues dans la langue), sinon textes historiques
export function ConditionTexts(data: ProcessEventData, texts: EventTexts): string[] {
    return data.conditionCauses?.length ? data.conditionCauses.map((cause) => texts.condition(cause)) : data.conditions ?? [];
}

export function LostConflicts(data: ProcessEventData): ConfirmationConflictModel[] {
    return (data.confirmation?.conflicts ?? []).filter((conflict) => !conflict.isWinning);
}

// cycles PROPORTIONAL dont le demandeur reprend la vanne (consigne customValue) : confirmation demandee bien que prioritaire
export function ProportionalOverrides(data: ProcessEventData): ConfirmationConflictModel[] {
    return (data.confirmation?.conflicts ?? []).filter((conflict) => conflict.isProportionalOverride);
}
