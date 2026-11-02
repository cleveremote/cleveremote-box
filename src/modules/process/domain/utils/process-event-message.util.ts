import { Language } from '@framework/i18n/language';
import { ConditionCauseModel, EventModel, EventOriginModel, EventStopModel, ProcessEventData } from '@process/domain/models/event.model';
import { EventTexts, FormatDuration } from './event-texts/event-texts';
import { AR_EVENT_TEXTS } from './event-texts/event-texts.ar';
import { EN_EVENT_TEXTS } from './event-texts/event-texts.en';
import { FR_EVENT_TEXTS } from './event-texts/event-texts.fr';

export { FormatDuration };

const EVENT_TEXTS: Record<Language, EventTexts> = {
    [Language.FR]: FR_EVENT_TEXTS,
    [Language.EN]: EN_EVENT_TEXTS,
    [Language.AR]: AR_EVENT_TEXTS
};

// langue absente ou inconnue : francais
const Texts = (lang: string | undefined): EventTexts => EVENT_TEXTS[lang as Language] ?? FR_EVENT_TEXTS;

// "manuellement", "par le planning « Matin »"...
export function DescribeOrigin(origin: EventOriginModel | undefined, lang?: string): string {
    return origin ? Texts(lang).origin(origin) : '';
}

export function DescribeStop(stop: EventStopModel | undefined, lang?: string): string {
    return Texts(lang).stop(stop);
}

// condition fausse : "humidite > 60 (actuel : 72)", prefixee par la sequence le cas echeant
export function DescribeCondition(cause: ConditionCauseModel, lang?: string): string {
    return Texts(lang).condition(cause);
}

// phrase lisible d'un event du journal d'execution (affichage direct par le front)
export function DescribeProcessEvent(data: ProcessEventData, lang?: string): string {
    const texts = Texts(lang);
    const label = data.kind && texts.kinds[data.kind];
    return label ? label(data, texts.quote(data.name)) : '';
}

// events du journal relus : message recalcule dans `lang` depuis les donnees structurees (historique compris)
export function TranslateEventMessages(events: EventModel[], lang: string | undefined): EventModel[] {
    for (const event of events ?? []) {
        const data = event.additionalData as ProcessEventData;
        if (data?.kind) {
            data.message = DescribeProcessEvent(data, lang);
        }
    }
    return events;
}
