import {
    ConfirmationAnswer, EventOriginModel, EventSource, EventStopModel, ProcessEventData, ProcessEventKind, StopReason
} from '@process/domain/models/event.model';

const Quote = (name: string | undefined): string => `« ${name ?? '?'} »`;

const Plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

const ByUser = (origin: EventOriginModel | undefined): string => origin?.requestedBy ? ` (${origin.requestedBy})` : '';

// 45 s / 2 min 13 s / 15 min / 1 h 05 min
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

const ORIGIN_LABELS: Record<EventSource, (origin: EventOriginModel) => string> = {
    [EventSource.MANUAL]: (origin) => 'manuellement' + ByUser(origin),
    [EventSource.PUSH_BUTTON]: (origin) => 'par bouton poussoir' + (origin.refName ? ` (actionneur ${Quote(origin.refName)})` : ''),
    [EventSource.SCHEDULE]: (origin) => `par le planning ${Quote(origin.refName)}`,
    [EventSource.TRIGGER]: (origin) => `par le déclencheur ${Quote(origin.refName)}`,
    [EventSource.GROUP]: (origin) => `par le groupe ${Quote(origin.refName)}`,
    [EventSource.CYCLE]: (origin) => `par le cycle ${Quote(origin.refName)}`,
    [EventSource.SYSTEM]: () => 'par le système'
};

// "manuellement", "par le planning « Matin »"...
export function DescribeOrigin(origin: EventOriginModel | undefined): string {
    const label = origin && ORIGIN_LABELS[origin.source];
    return label ? label(origin) : '';
}

const STOP_LABELS: Record<StopReason, (stop: EventStopModel) => string> = {
    [StopReason.COMPLETED]: () => 'terminé normalement',
    [StopReason.MANUAL]: (stop) => 'arrêté manuellement' + ByUser(stop.by),
    [StopReason.PUSH_BUTTON]: () => 'arrêté par bouton poussoir',
    [StopReason.SCHEDULE]: (stop) => `arrêté par le planning ${Quote(stop.by?.refName)}`,
    [StopReason.TRIGGER]: (stop) => `arrêté par le déclencheur ${Quote(stop.by?.refName)}`,
    [StopReason.PREEMPTED]: (stop) => `arrêté : préempté par ${Quote(stop.by?.refName)}`,
    [StopReason.MODULE_OVERRIDE]: (stop) => `arrêté : actionneur repris par le module ${Quote(stop.by?.refName)}`,
    [StopReason.PARENT_STOPPED]: (stop) => `arrêté avec ${Quote(stop.by?.refName)}`,
    [StopReason.DRIVEN]: (stop) => `arrêté par le cycle ${Quote(stop.by?.refName)}`,
    [StopReason.ERROR]: (stop) => `arrêté sur erreur${stop.error ? ` (${stop.error})` : ''}`,
    [StopReason.SYSTEM_RESET]: () => 'interrompu par le redémarrage de la box',
    [StopReason.CONFIRMATION_REFUSED]: (stop) => 'confirmation refusée' + ByUser(stop.by),
    [StopReason.CANCELLED_WHILE_WAITING]: (stop) => 'arrêté pendant l\'attente de confirmation' + ByUser(stop.by),
    [StopReason.CANCELLED_WHILE_QUEUED]: (stop) => 'arrêté pendant l\'attente en file' + ByUser(stop.by),
    [StopReason.SKIPPED_BY_USER]: () => 'passée manuellement'
};

export function DescribeStop(stop: EventStopModel | undefined): string {
    const label = stop && STOP_LABELS[stop.reason];
    return label ? label(stop) : 'arrêté';
}

const After = (ms: number | undefined): string => ms !== undefined ? ` après ${FormatDuration(ms)}` : '';

const TriggeredBy = (data: ProcessEventData): string => {
    const origin = DescribeOrigin(data.origin);
    return origin ? ` (déclenché ${origin})` : '';
};

const ConditionList = (data: ProcessEventData): string => data.conditions?.length ? ` — ${data.conditions.join(' ; ')}` : '';

function DescribeConfirmation(data: ProcessEventData): string {
    const confirmation = data.confirmation;
    if (!confirmation) { return ' (sans confirmation)'; }
    const by = confirmation.answeredBy ? ` par ${confirmation.answeredBy}` : '';
    if (confirmation.answer === ConfirmationAnswer.QUEUE) {
        return `, mis en file${by}${After(confirmation.waitMs)} puis démarré à la fin des conflits`;
    }
    return `, confirmé (${confirmation.answer ?? ConfirmationAnswer.FORCE})${by}${After(confirmation.waitMs)}`;
}

function DescribeConfirmationRequest(data: ProcessEventData): string {
    const reasons: string[] = [];
    if (data.confirmation?.isRequested) { reasons.push('confirmation demandée'); }
    const lost = (data.confirmation?.conflicts ?? []).filter((conflict) => !conflict.isWinning);
    if (lost.length) {
        reasons.push('conflit perdu avec ' + lost.map((conflict) => `${Quote(conflict.name)} (${conflict.mode})`).join(', '));
    }
    return reasons.length ? ` — ${reasons.join(', ')}` : '';
}

function DescribeSummary(data: ProcessEventData): string {
    const sequences = data.sequences;
    if (!sequences || (!sequences.run.length && !sequences.skipped.length)) { return ''; }
    const parts = [Plural(sequences.run.length, 'séquence') + ' exécutée' + (sequences.run.length > 1 ? 's' : '')];
    if (sequences.forced.length) { parts.push(`${sequences.forced.length} forcée${sequences.forced.length > 1 ? 's' : ''}`); }
    if (sequences.skipped.length) { parts.push(`${sequences.skipped.length} sautée${sequences.skipped.length > 1 ? 's' : ''}`); }
    return ` — ${parts.join(', ')}`;
}

function DescribeSequenceEnd(data: ProcessEventData, name: string): string {
    if (!data.stop || data.stop.reason === StopReason.COMPLETED) { return `Séquence ${name} terminée${After(data.realDuration)}`; }
    if (data.stop.reason === StopReason.SKIPPED_BY_USER) { return `Séquence ${name} passée manuellement${After(data.realDuration)}`; }
    const label = DescribeStop(data.stop).replace(/^arrêté/, 'arrêtée').replace(/^interrompu/, 'interrompue');
    return `Séquence ${name} ${label}${After(data.realDuration)}`;
}

const KIND_LABELS: Record<ProcessEventKind, (data: ProcessEventData, name: string) => string> = {
    [ProcessEventKind.START_REFUSED]: (data, name) =>
        `${name} non démarré${TriggeredBy(data)} : conditions non vérifiées${ConditionList(data)}`,
    [ProcessEventKind.CONFIRMATION_REQUESTED]: (data, name) =>
        `${name} en attente de confirmation${TriggeredBy(data)}${DescribeConfirmationRequest(data)}`,
    [ProcessEventKind.CYCLE_QUEUED]: (data, name) => `${name} en file d'attente${TriggeredBy(data)}` +
        (data.waitingFor?.length ? ` jusqu'à la fin de ${data.waitingFor.map(Quote).join(', ')}` : ''),
    [ProcessEventKind.CYCLE_CANCELLED]: (data, name) =>
        `${name} annulé${TriggeredBy(data)} : ${DescribeStop(data.stop)}${After(data.confirmation?.waitMs)}`,
    [ProcessEventKind.CYCLE_STARTED]: (data, name) => `${name} démarré ${DescribeOrigin(data.origin)}`.trimEnd() +
        DescribeConfirmation(data) +
        (data.preempted?.length ? ` — ${data.preempted.map(Quote).join(', ')} stoppé${data.preempted.length > 1 ? 's' : ''}` : ''),
    [ProcessEventKind.CYCLE_ENDED]: (data, name) => `${name} ${DescribeStop(data.stop)}${After(data.realDuration)}` +
        (data.plannedDuration ? ` (prévu ${FormatDuration(data.plannedDuration)})` : '') + DescribeSummary(data),
    [ProcessEventKind.SEQUENCE_STARTED]: (data, name) => `Séquence ${name} démarrée` +
        (data.plannedDuration ? ` (${FormatDuration(data.plannedDuration)} prévues)` : '') + (data.isForced ? ' — forcée' : ''),
    [ProcessEventKind.SEQUENCE_ENDED]: DescribeSequenceEnd,
    [ProcessEventKind.SEQUENCE_SKIPPED]: (data, name) => `Séquence ${name} sautée : conditions non vérifiées${ConditionList(data)}`
};

// phrase lisible d'un event du journal d'execution (affichage direct par le front)
export function DescribeProcessEvent(data: ProcessEventData): string {
    const label = data.kind && KIND_LABELS[data.kind];
    return label ? label(data, Quote(data.name)) : '';
}
