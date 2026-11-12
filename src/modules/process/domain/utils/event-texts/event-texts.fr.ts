import {
    ConfirmationAnswer, EventOriginModel, EventSource, EventStopModel, ProcessEventData, ProcessEventKind, StopReason
} from '@process/domain/models/event.model';
import { ConditionTexts, EventTexts, FormatDuration, LostConflicts, ProportionalOverrides } from './event-texts';

const Quote = (name: string | undefined): string => `« ${name ?? '?'} »`;

const Plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

const ByUser = (origin: EventOriginModel | undefined): string => origin?.requestedBy ? ` (${origin.requestedBy})` : '';

const After = (ms: number | undefined): string => ms !== undefined ? ` après ${FormatDuration(ms)}` : '';

const ORIGIN_LABELS: Record<EventSource, (origin: EventOriginModel) => string> = {
    [EventSource.MANUAL]: (origin) => 'manuellement' + ByUser(origin),
    [EventSource.PUSH_BUTTON]: (origin) => 'par bouton poussoir' + (origin.refName ? ` (actionneur ${Quote(origin.refName)})` : ''),
    [EventSource.SCHEDULE]: (origin) => `par le planning ${Quote(origin.refName)}`,
    [EventSource.TRIGGER]: (origin) => `par le déclencheur ${Quote(origin.refName)}`,
    [EventSource.GROUP]: (origin) => `par le groupe ${Quote(origin.refName)}`,
    [EventSource.CYCLE]: (origin) => `par le cycle ${Quote(origin.refName)}`,
    [EventSource.SYSTEM]: () => 'par le système'
};

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
    [StopReason.SKIPPED_BY_USER]: () => 'passée manuellement',
    [StopReason.INVERTER_MANUAL]: (stop) => `arrêté : variateur ${Quote(stop.by?.refName)} passé en manuel`
};

const Origin = (origin: EventOriginModel | undefined): string => {
    const label = origin && ORIGIN_LABELS[origin.source];
    return label ? label(origin) : '';
};

const Stop = (stop: EventStopModel | undefined): string => {
    const label = stop && STOP_LABELS[stop.reason];
    return label ? label(stop) : 'arrêté';
};

const TriggeredBy = (data: ProcessEventData): string => {
    const origin = Origin(data.origin);
    return origin ? ` (déclenché ${origin})` : '';
};

const ConditionList = (data: ProcessEventData): string => {
    const conditions = ConditionTexts(data, FR_EVENT_TEXTS);
    return conditions.length ? ` — ${conditions.join(' ; ')}` : '';
};

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
    const lost = LostConflicts(data);
    if (lost.length) {
        reasons.push('conflit perdu avec ' + lost.map((conflict) => `${Quote(conflict.name)} (${conflict.mode})`).join(', '));
    }
    const overrides = ProportionalOverrides(data);
    if (overrides.length) {
        reasons.push('prioritaire sur le cycle proportionnel ' + overrides.map((conflict) => Quote(conflict.name)).join(', '));
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
    const label = Stop(data.stop).replace(/^arrêté/, 'arrêtée').replace(/^interrompu/, 'interrompue');
    return `Séquence ${name} ${label}${After(data.realDuration)}`;
}

export const FR_EVENT_TEXTS: EventTexts = {
    quote: Quote,
    origin: Origin,
    stop: Stop,
    condition: (cause) => cause.error ?? (cause.sequenceName ? `séquence ${cause.sequenceName} : ` : '') +
        `${cause.elementName ?? cause.elementId} ${cause.operator} ${cause.expected} (actuel : ${cause.current ?? 'inconnu'})`,
    kinds: {
        [ProcessEventKind.START_REFUSED]: (data, name) =>
            `${name} non démarré${TriggeredBy(data)} : conditions non vérifiées${ConditionList(data)}`,
        [ProcessEventKind.CONFIRMATION_REQUESTED]: (data, name) =>
            `${name} en attente de confirmation${TriggeredBy(data)}${DescribeConfirmationRequest(data)}`,
        [ProcessEventKind.CYCLE_QUEUED]: (data, name) => `${name} en file d'attente${TriggeredBy(data)}` +
            (data.waitingFor?.length ? ` jusqu'à la fin de ${data.waitingFor.map(Quote).join(', ')}` : ''),
        [ProcessEventKind.CYCLE_CANCELLED]: (data, name) =>
            `${name} annulé${TriggeredBy(data)} : ${Stop(data.stop)}${After(data.confirmation?.waitMs)}`,
        [ProcessEventKind.CYCLE_STARTED]: (data, name) => `${name} démarré ${Origin(data.origin)}`.trimEnd() +
            DescribeConfirmation(data) +
            (data.preempted?.length ? ` — ${data.preempted.map(Quote).join(', ')} stoppé${data.preempted.length > 1 ? 's' : ''}` : ''),
        [ProcessEventKind.CYCLE_ENDED]: (data, name) => `${name} ${Stop(data.stop)}${After(data.realDuration)}` +
            (data.plannedDuration ? ` (prévu ${FormatDuration(data.plannedDuration)})` : '') + DescribeSummary(data),
        [ProcessEventKind.SEQUENCE_STARTED]: (data, name) => `Séquence ${name} démarrée` +
            (data.plannedDuration ? ` (${FormatDuration(data.plannedDuration)} prévues)` : '') + (data.isForced ? ' — forcée' : ''),
        [ProcessEventKind.SEQUENCE_ENDED]: DescribeSequenceEnd,
        [ProcessEventKind.SEQUENCE_SKIPPED]: (data, name) => `Séquence ${name} sautée : conditions non vérifiées${ConditionList(data)}`,
        [ProcessEventKind.INVERTER_MODE_CHANGED]: (data, name) => `Variateur ${name} en ${data.inverter?.mode ?? ''}` +
            (data.inverter?.frequency !== undefined ? ` à ${data.inverter.frequency} Hz` : '') +
            (data.inverter?.pidSetpoint !== undefined ? `, consigne ${data.inverter.pidSetpoint}` : '') +
            (data.inverter?.sequenceName ? ` (séquence ${Quote(data.inverter.sequenceName)})` : ' (mode par défaut)'),
        [ProcessEventKind.INVERTER_MANUAL_ENGAGED]: (_data, name) => `Variateur ${name} passé en manuel : directives des séquences ignorées`,
        [ProcessEventKind.INVERTER_MANUAL_RELEASED]: (_data, name) => `Variateur ${name} revenu en mode auto`,
        [ProcessEventKind.INVERTER_DIRECTIVE_IGNORED]: (data, name) => `Directive de la séquence ${Quote(data.inverter?.sequenceName ?? '')}` +
            ` ignorée : variateur ${name} en manuel`
    }
};
