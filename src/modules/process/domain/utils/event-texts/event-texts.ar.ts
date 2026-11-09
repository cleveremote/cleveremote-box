import {
    ConfirmationAnswer, EventOriginModel, EventSource, EventStopModel, ProcessEventData, ProcessEventKind, StopReason
} from '@process/domain/models/event.model';
import { ConditionTexts, EventTexts, FormatDuration, LostConflicts } from './event-texts';

// compteurs au format « libelle : nombre » : evite les 6 formes de pluriel de l'arabe
const Quote = (name: string | undefined): string => `«${name ?? '?'}»`;

const ByUser = (origin: EventOriginModel | undefined): string => origin?.requestedBy ? ` (${origin.requestedBy})` : '';

const After = (ms: number | undefined): string => ms !== undefined ? ` بعد ${FormatDuration(ms)}` : '';

const ORIGIN_LABELS: Record<EventSource, (origin: EventOriginModel) => string> = {
    [EventSource.MANUAL]: (origin) => 'يدويًا' + ByUser(origin),
    [EventSource.PUSH_BUTTON]: (origin) => 'بواسطة زر الضغط' + (origin.refName ? ` (المشغّل ${Quote(origin.refName)})` : ''),
    [EventSource.SCHEDULE]: (origin) => `بواسطة الجدول الزمني ${Quote(origin.refName)}`,
    [EventSource.TRIGGER]: (origin) => `بواسطة المحفّز ${Quote(origin.refName)}`,
    [EventSource.GROUP]: (origin) => `بواسطة المجموعة ${Quote(origin.refName)}`,
    [EventSource.CYCLE]: (origin) => `بواسطة الدورة ${Quote(origin.refName)}`,
    [EventSource.SYSTEM]: () => 'بواسطة النظام'
};

const STOP_LABELS: Record<StopReason, (stop: EventStopModel) => string> = {
    [StopReason.COMPLETED]: () => 'انتهى بشكل طبيعي',
    [StopReason.MANUAL]: (stop) => 'أُوقف يدويًا' + ByUser(stop.by),
    [StopReason.PUSH_BUTTON]: () => 'أُوقف بواسطة زر الضغط',
    [StopReason.SCHEDULE]: (stop) => `أُوقف بواسطة الجدول الزمني ${Quote(stop.by?.refName)}`,
    [StopReason.TRIGGER]: (stop) => `أُوقف بواسطة المحفّز ${Quote(stop.by?.refName)}`,
    [StopReason.PREEMPTED]: (stop) => `أُوقف لصالح ${Quote(stop.by?.refName)}`,
    [StopReason.MODULE_OVERRIDE]: (stop) => `أُوقف: استعادت الوحدة ${Quote(stop.by?.refName)} المشغّل`,
    [StopReason.PARENT_STOPPED]: (stop) => `أُوقف مع ${Quote(stop.by?.refName)}`,
    [StopReason.DRIVEN]: (stop) => `أُوقف بواسطة الدورة ${Quote(stop.by?.refName)}`,
    [StopReason.ERROR]: (stop) => `أُوقف بسبب خطأ${stop.error ? ` (${stop.error})` : ''}`,
    [StopReason.SYSTEM_RESET]: () => 'توقف بسبب إعادة تشغيل الجهاز',
    [StopReason.CONFIRMATION_REFUSED]: (stop) => 'رُفض التأكيد' + ByUser(stop.by),
    [StopReason.CANCELLED_WHILE_WAITING]: (stop) => 'أُوقف أثناء انتظار التأكيد' + ByUser(stop.by),
    [StopReason.CANCELLED_WHILE_QUEUED]: (stop) => 'أُوقف أثناء الانتظار في الطابور' + ByUser(stop.by),
    [StopReason.SKIPPED_BY_USER]: () => 'تم تخطيه يدويًا',
    [StopReason.INVERTER_MANUAL]: (stop) => `أُوقف: المحول ${Quote(stop.by?.refName)} في الوضع اليدوي`
};

const Origin = (origin: EventOriginModel | undefined): string => {
    const label = origin && ORIGIN_LABELS[origin.source];
    return label ? label(origin) : '';
};

const Stop = (stop: EventStopModel | undefined): string => {
    const label = stop && STOP_LABELS[stop.reason];
    return label ? label(stop) : 'أُوقف';
};

const TriggeredBy = (data: ProcessEventData): string => {
    const origin = Origin(data.origin);
    return origin ? ` (تم التشغيل ${origin})` : '';
};

const ConditionList = (data: ProcessEventData): string => {
    const conditions = ConditionTexts(data, AR_EVENT_TEXTS);
    return conditions.length ? ` — ${conditions.join('؛ ')}` : '';
};

const Names = (names: string[]): string => names.map(Quote).join('، ');

function DescribeConfirmation(data: ProcessEventData): string {
    const confirmation = data.confirmation;
    if (!confirmation) { return ' (بدون تأكيد)'; }
    const by = confirmation.answeredBy ? ` من طرف ${confirmation.answeredBy}` : '';
    if (confirmation.answer === ConfirmationAnswer.QUEUE) {
        return `، وُضع في الطابور${by}${After(confirmation.waitMs)} ثم بدأ عند انتهاء التعارضات`;
    }
    return `، تم التأكيد (${confirmation.answer ?? ConfirmationAnswer.FORCE})${by}${After(confirmation.waitMs)}`;
}

function DescribeConfirmationRequest(data: ProcessEventData): string {
    const reasons: string[] = [];
    if (data.confirmation?.isRequested) { reasons.push('طُلب التأكيد'); }
    const lost = LostConflicts(data);
    if (lost.length) {
        reasons.push('خسر التعارض مع ' + lost.map((conflict) => `${Quote(conflict.name)} (${conflict.mode})`).join('، '));
    }
    return reasons.length ? ` — ${reasons.join('، ')}` : '';
}

function DescribeSummary(data: ProcessEventData): string {
    const sequences = data.sequences;
    if (!sequences || (!sequences.run.length && !sequences.skipped.length)) { return ''; }
    const parts = [`التسلسلات المنفذة: ${sequences.run.length}`];
    if (sequences.forced.length) { parts.push(`المفروضة: ${sequences.forced.length}`); }
    if (sequences.skipped.length) { parts.push(`المتخطاة: ${sequences.skipped.length}`); }
    return ` — ${parts.join('، ')}`;
}

function DescribeSequenceEnd(data: ProcessEventData, name: string): string {
    if (!data.stop || data.stop.reason === StopReason.COMPLETED) { return `انتهى التسلسل ${name}${After(data.realDuration)}`; }
    if (data.stop.reason === StopReason.SKIPPED_BY_USER) { return `تم تخطي التسلسل ${name} يدويًا${After(data.realDuration)}`; }
    return `التسلسل ${name} ${Stop(data.stop)}${After(data.realDuration)}`;
}

export const AR_EVENT_TEXTS: EventTexts = {
    quote: Quote,
    origin: Origin,
    stop: Stop,
    condition: (cause) => cause.error ?? (cause.sequenceName ? `التسلسل ${cause.sequenceName}: ` : '') +
        `${cause.elementName ?? cause.elementId} ${cause.operator} ${cause.expected} (القيمة الحالية: ${cause.current ?? 'غير معروفة'})`,
    kinds: {
        [ProcessEventKind.START_REFUSED]: (data, name) =>
            `لم يبدأ ${name}${TriggeredBy(data)}: الشروط غير مستوفاة${ConditionList(data)}`,
        [ProcessEventKind.CONFIRMATION_REQUESTED]: (data, name) =>
            `${name} في انتظار التأكيد${TriggeredBy(data)}${DescribeConfirmationRequest(data)}`,
        [ProcessEventKind.CYCLE_QUEUED]: (data, name) => `${name} في الطابور${TriggeredBy(data)}` +
            (data.waitingFor?.length ? ` حتى انتهاء ${Names(data.waitingFor)}` : ''),
        [ProcessEventKind.CYCLE_CANCELLED]: (data, name) =>
            `أُلغي ${name}${TriggeredBy(data)}: ${Stop(data.stop)}${After(data.confirmation?.waitMs)}`,
        [ProcessEventKind.CYCLE_STARTED]: (data, name) => `بدأ ${name} ${Origin(data.origin)}`.trimEnd() +
            DescribeConfirmation(data) +
            (data.preempted?.length ? ` — تم إيقاف ${Names(data.preempted)}` : ''),
        [ProcessEventKind.CYCLE_ENDED]: (data, name) => `${name} ${Stop(data.stop)}${After(data.realDuration)}` +
            (data.plannedDuration ? ` (المدة المقررة ${FormatDuration(data.plannedDuration)})` : '') + DescribeSummary(data),
        [ProcessEventKind.SEQUENCE_STARTED]: (data, name) => `بدأ التسلسل ${name}` +
            (data.plannedDuration ? ` (المدة المقررة ${FormatDuration(data.plannedDuration)})` : '') + (data.isForced ? ' — مفروض' : ''),
        [ProcessEventKind.SEQUENCE_ENDED]: DescribeSequenceEnd,
        [ProcessEventKind.SEQUENCE_SKIPPED]: (data, name) => `تم تخطي التسلسل ${name}: الشروط غير مستوفاة${ConditionList(data)}`,
        [ProcessEventKind.INVERTER_MODE_CHANGED]: (data, name) => `المحول ${name} في وضع ${data.inverter?.mode ?? ''}` +
            (data.inverter?.frequency !== undefined ? ` بتردد ${data.inverter.frequency} هرتز` : '') +
            (data.inverter?.pidSetpoint !== undefined ? `، القيمة المرجعية ${data.inverter.pidSetpoint}` : '') +
            (data.inverter?.sequenceName ? ` (التسلسل ${Quote(data.inverter.sequenceName)})` : ' (الوضع الافتراضي)'),
        [ProcessEventKind.INVERTER_MANUAL_ENGAGED]: (_data, name) => `المحول ${name} في الوضع اليدوي: تم تجاهل توجيهات التسلسلات`,
        [ProcessEventKind.INVERTER_MANUAL_RELEASED]: (_data, name) => `عاد المحول ${name} إلى الوضع التلقائي`,
        [ProcessEventKind.INVERTER_DIRECTIVE_IGNORED]: (data, name) => `تم تجاهل توجيه التسلسل ${Quote(data.inverter?.sequenceName ?? '')}` +
            `: المحول ${name} في الوضع اليدوي`
    }
};
