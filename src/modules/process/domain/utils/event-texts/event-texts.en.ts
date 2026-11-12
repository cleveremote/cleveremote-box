import {
    ConfirmationAnswer, EventOriginModel, EventSource, EventStopModel, ProcessEventData, ProcessEventKind, StopReason
} from '@process/domain/models/event.model';
import { ConditionTexts, EventTexts, FormatDuration, LostConflicts, ProportionalOverrides } from './event-texts';

const Quote = (name: string | undefined): string => `“${name ?? '?'}”`;

const Plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

const ByUser = (origin: EventOriginModel | undefined): string => origin?.requestedBy ? ` (${origin.requestedBy})` : '';

const After = (ms: number | undefined): string => ms !== undefined ? ` after ${FormatDuration(ms)}` : '';

const ORIGIN_LABELS: Record<EventSource, (origin: EventOriginModel) => string> = {
    [EventSource.MANUAL]: (origin) => 'manually' + ByUser(origin),
    [EventSource.PUSH_BUTTON]: (origin) => 'by push button' + (origin.refName ? ` (actuator ${Quote(origin.refName)})` : ''),
    [EventSource.SCHEDULE]: (origin) => `by schedule ${Quote(origin.refName)}`,
    [EventSource.TRIGGER]: (origin) => `by trigger ${Quote(origin.refName)}`,
    [EventSource.GROUP]: (origin) => `by group ${Quote(origin.refName)}`,
    [EventSource.CYCLE]: (origin) => `by cycle ${Quote(origin.refName)}`,
    [EventSource.SYSTEM]: () => 'by the system'
};

const STOP_LABELS: Record<StopReason, (stop: EventStopModel) => string> = {
    [StopReason.COMPLETED]: () => 'completed normally',
    [StopReason.MANUAL]: (stop) => 'stopped manually' + ByUser(stop.by),
    [StopReason.PUSH_BUTTON]: () => 'stopped by push button',
    [StopReason.SCHEDULE]: (stop) => `stopped by schedule ${Quote(stop.by?.refName)}`,
    [StopReason.TRIGGER]: (stop) => `stopped by trigger ${Quote(stop.by?.refName)}`,
    [StopReason.PREEMPTED]: (stop) => `stopped: preempted by ${Quote(stop.by?.refName)}`,
    [StopReason.MODULE_OVERRIDE]: (stop) => `stopped: actuator taken over by module ${Quote(stop.by?.refName)}`,
    [StopReason.PARENT_STOPPED]: (stop) => `stopped with ${Quote(stop.by?.refName)}`,
    [StopReason.DRIVEN]: (stop) => `stopped by cycle ${Quote(stop.by?.refName)}`,
    [StopReason.ERROR]: (stop) => `stopped on error${stop.error ? ` (${stop.error})` : ''}`,
    [StopReason.SYSTEM_RESET]: () => 'interrupted by the box restart',
    [StopReason.CONFIRMATION_REFUSED]: (stop) => 'confirmation refused' + ByUser(stop.by),
    [StopReason.CANCELLED_WHILE_WAITING]: (stop) => 'stopped while waiting for confirmation' + ByUser(stop.by),
    [StopReason.CANCELLED_WHILE_QUEUED]: (stop) => 'stopped while queued' + ByUser(stop.by),
    [StopReason.SKIPPED_BY_USER]: () => 'skipped manually',
    [StopReason.INVERTER_MANUAL]: (stop) => `stopped: inverter ${Quote(stop.by?.refName)} switched to manual`
};

const Origin = (origin: EventOriginModel | undefined): string => {
    const label = origin && ORIGIN_LABELS[origin.source];
    return label ? label(origin) : '';
};

const Stop = (stop: EventStopModel | undefined): string => {
    const label = stop && STOP_LABELS[stop.reason];
    return label ? label(stop) : 'stopped';
};

const TriggeredBy = (data: ProcessEventData): string => {
    const origin = Origin(data.origin);
    return origin ? ` (triggered ${origin})` : '';
};

const ConditionList = (data: ProcessEventData): string => {
    const conditions = ConditionTexts(data, EN_EVENT_TEXTS);
    return conditions.length ? ` — ${conditions.join('; ')}` : '';
};

function DescribeConfirmation(data: ProcessEventData): string {
    const confirmation = data.confirmation;
    if (!confirmation) { return ' (no confirmation)'; }
    const by = confirmation.answeredBy ? ` by ${confirmation.answeredBy}` : '';
    if (confirmation.answer === ConfirmationAnswer.QUEUE) {
        return `, queued${by}${After(confirmation.waitMs)} then started when the conflicts ended`;
    }
    return `, confirmed (${confirmation.answer ?? ConfirmationAnswer.FORCE})${by}${After(confirmation.waitMs)}`;
}

function DescribeConfirmationRequest(data: ProcessEventData): string {
    const reasons: string[] = [];
    if (data.confirmation?.isRequested) { reasons.push('confirmation requested'); }
    const lost = LostConflicts(data);
    if (lost.length) {
        reasons.push('conflict lost with ' + lost.map((conflict) => `${Quote(conflict.name)} (${conflict.mode})`).join(', '));
    }
    const overrides = ProportionalOverrides(data);
    if (overrides.length) {
        reasons.push('priority over the proportional cycle ' + overrides.map((conflict) => Quote(conflict.name)).join(', '));
    }
    return reasons.length ? ` — ${reasons.join(', ')}` : '';
}

function DescribeSummary(data: ProcessEventData): string {
    const sequences = data.sequences;
    if (!sequences || (!sequences.run.length && !sequences.skipped.length)) { return ''; }
    const parts = [Plural(sequences.run.length, 'sequence') + ' run'];
    if (sequences.forced.length) { parts.push(`${sequences.forced.length} forced`); }
    if (sequences.skipped.length) { parts.push(`${sequences.skipped.length} skipped`); }
    return ` — ${parts.join(', ')}`;
}

function DescribeSequenceEnd(data: ProcessEventData, name: string): string {
    if (!data.stop || data.stop.reason === StopReason.COMPLETED) { return `Sequence ${name} completed${After(data.realDuration)}`; }
    if (data.stop.reason === StopReason.SKIPPED_BY_USER) { return `Sequence ${name} skipped manually${After(data.realDuration)}`; }
    return `Sequence ${name} ${Stop(data.stop)}${After(data.realDuration)}`;
}

export const EN_EVENT_TEXTS: EventTexts = {
    quote: Quote,
    origin: Origin,
    stop: Stop,
    condition: (cause) => cause.error ?? (cause.sequenceName ? `sequence ${cause.sequenceName}: ` : '') +
        `${cause.elementName ?? cause.elementId} ${cause.operator} ${cause.expected} (current: ${cause.current ?? 'unknown'})`,
    kinds: {
        [ProcessEventKind.START_REFUSED]: (data, name) =>
            `${name} not started${TriggeredBy(data)}: conditions not met${ConditionList(data)}`,
        [ProcessEventKind.CONFIRMATION_REQUESTED]: (data, name) =>
            `${name} waiting for confirmation${TriggeredBy(data)}${DescribeConfirmationRequest(data)}`,
        [ProcessEventKind.CYCLE_QUEUED]: (data, name) => `${name} queued${TriggeredBy(data)}` +
            (data.waitingFor?.length ? ` until the end of ${data.waitingFor.map(Quote).join(', ')}` : ''),
        [ProcessEventKind.CYCLE_CANCELLED]: (data, name) =>
            `${name} cancelled${TriggeredBy(data)}: ${Stop(data.stop)}${After(data.confirmation?.waitMs)}`,
        [ProcessEventKind.CYCLE_STARTED]: (data, name) => `${name} started ${Origin(data.origin)}`.trimEnd() +
            DescribeConfirmation(data) +
            (data.preempted?.length ? ` — ${data.preempted.map(Quote).join(', ')} stopped` : ''),
        [ProcessEventKind.CYCLE_ENDED]: (data, name) => `${name} ${Stop(data.stop)}${After(data.realDuration)}` +
            (data.plannedDuration ? ` (planned ${FormatDuration(data.plannedDuration)})` : '') + DescribeSummary(data),
        [ProcessEventKind.SEQUENCE_STARTED]: (data, name) => `Sequence ${name} started` +
            (data.plannedDuration ? ` (${FormatDuration(data.plannedDuration)} planned)` : '') + (data.isForced ? ' — forced' : ''),
        [ProcessEventKind.SEQUENCE_ENDED]: DescribeSequenceEnd,
        [ProcessEventKind.SEQUENCE_SKIPPED]: (data, name) => `Sequence ${name} skipped: conditions not met${ConditionList(data)}`,
        [ProcessEventKind.INVERTER_MODE_CHANGED]: (data, name) => `Inverter ${name} set to ${data.inverter?.mode ?? ''}` +
            (data.inverter?.frequency !== undefined ? ` at ${data.inverter.frequency} Hz` : '') +
            (data.inverter?.pidSetpoint !== undefined ? `, setpoint ${data.inverter.pidSetpoint}` : '') +
            (data.inverter?.sequenceName ? ` (sequence ${Quote(data.inverter.sequenceName)})` : ' (default mode)'),
        [ProcessEventKind.INVERTER_MANUAL_ENGAGED]: (_data, name) => `Inverter ${name} switched to manual: sequence directives ignored`,
        [ProcessEventKind.INVERTER_MANUAL_RELEASED]: (_data, name) => `Inverter ${name} back to auto mode`,
        [ProcessEventKind.INVERTER_DIRECTIVE_IGNORED]: (data, name) => `Directive of sequence ${Quote(data.inverter?.sequenceName ?? '')}` +
            ` ignored: inverter ${name} in manual mode`
    }
};
