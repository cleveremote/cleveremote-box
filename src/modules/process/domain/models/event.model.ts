import { ExecutableAction, ExecutableStatus } from '../interfaces/executable.interface';
import { ConfirmationRequestModel } from './confirmation-request.model';

export enum ElementType {
    CYCLE = 'CYCLE',
    SEQUENCE = 'SEQUENCE',
    SENSOR = 'SENSOR',
    INVERTER = 'INVERTER'
}

// etape du journal d'execution d'un cycle (cf. RunContextModel : tous les events d'un run partagent son runId)
export enum ProcessEventKind {
    START_REFUSED = 'START_REFUSED', // conditions du cycle fausses : pas de statut porte (ignore par la rehydratation)
    CONFIRMATION_REQUESTED = 'CONFIRMATION_REQUESTED',
    CYCLE_QUEUED = 'CYCLE_QUEUED',
    CYCLE_CANCELLED = 'CYCLE_CANCELLED', // jamais demarre (confirmation refusee, OFF pendant l'attente / la file)
    CYCLE_STARTED = 'CYCLE_STARTED',
    CYCLE_ENDED = 'CYCLE_ENDED',
    SEQUENCE_STARTED = 'SEQUENCE_STARTED',
    SEQUENCE_ENDED = 'SEQUENCE_ENDED',
    SEQUENCE_SKIPPED = 'SEQUENCE_SKIPPED', // conditions de la sequence fausses
    // variateur (name = variateur, inverter = detail)
    INVERTER_MODE_CHANGED = 'INVERTER_MODE_CHANGED', // directive appliquee (mode, consigne)
    INVERTER_MANUAL_ENGAGED = 'INVERTER_MANUAL_ENGAGED', // switchs S1..S3 fermes : directives des sequences ignorees
    INVERTER_MANUAL_RELEASED = 'INVERTER_MANUAL_RELEASED', // switchs rouverts : retour au mode auto
    INVERTER_DIRECTIVE_IGNORED = 'INVERTER_DIRECTIVE_IGNORED' // directive d'une sequence (forcee) non ecrite : variateur en manuel
}

// detail d'un event variateur
export class InverterEventDetail {
    public mode?: string;
    public frequency?: number;
    public pidSetpoint?: number;
    public sequenceId?: string;
    public sequenceName?: string;
}

// qui a emis l'ordre (plus precis que ProcessMode, qui ne sert qu'a l'arbitrage des rangs)
export enum EventSource {
    MANUAL = 'MANUAL',
    PUSH_BUTTON = 'PUSH_BUTTON',
    SCHEDULE = 'SCHEDULE',
    TRIGGER = 'TRIGGER',
    GROUP = 'GROUP', // enfant demarre / stoppe par son Group
    CYCLE = 'CYCLE', // MODULE pilote par un cycle (regle 2)
    SYSTEM = 'SYSTEM'
}

export enum StopReason {
    COMPLETED = 'COMPLETED', // toutes les sequences terminees
    MANUAL = 'MANUAL',
    PUSH_BUTTON = 'PUSH_BUTTON',
    SCHEDULE = 'SCHEDULE',
    TRIGGER = 'TRIGGER',
    PREEMPTED = 'PREEMPTED', // stoppe par un cycle demarre en conflit (by = ce cycle)
    MODULE_OVERRIDE = 'MODULE_OVERRIDE', // regle 1 : un MODULE a repris l'actionneur
    PARENT_STOPPED = 'PARENT_STOPPED', // Group parent / cycle proprietaire arrete
    DRIVEN = 'DRIVEN', // MODULE coupe par le cycle qui le pilote (regle 2)
    ERROR = 'ERROR',
    SYSTEM_RESET = 'SYSTEM_RESET', // reset au demarrage de la box
    CONFIRMATION_REFUSED = 'CONFIRMATION_REFUSED',
    CANCELLED_WHILE_WAITING = 'CANCELLED_WHILE_WAITING',
    CANCELLED_WHILE_QUEUED = 'CANCELLED_WHILE_QUEUED',
    SKIPPED_BY_USER = 'SKIPPED_BY_USER', // sequence : commande SKIP du front
    INVERTER_MANUAL = 'INVERTER_MANUAL' // sequence : variateur pilote passe en manuel (by = variateur)
}

export enum ConfirmationAnswer {
    FORCE = 'FORCE',
    QUEUE = 'QUEUE',
    IGNORE = 'IGNORE'
}

export class EventOriginModel {
    public source: EventSource;
    // schedule / trigger / Group parent / cycle pilote / actionneur du bouton poussoir
    public refId?: string;
    public refName?: string;
    // run du cycle reference (GROUP / CYCLE) : relie un run enfant a son run parent
    public refRunId?: string;
    // utilisateur, si le front l'envoie
    public requestedBy?: string;
}

export class EventStopModel {
    public reason: StopReason;
    public by?: EventOriginModel;
    public error?: string;
}

export class EventConfirmationModel extends ConfirmationRequestModel {
    public answer?: ConfirmationAnswer;
    public requestedAt?: Date;
    public answeredAt?: Date;
    public waitMs?: number;
    public answeredBy?: string;
}

// noms des sequences d'un run, au fil de l'execution
export class EventSequencesSummary {
    public run: string[] = [];
    public skipped: string[] = [];
    public forced: string[] = [];
}

// condition fausse, structuree pour la traduction par le front (conditions[] : meme contenu en texte)
export class ConditionCauseModel {
    public elementId: string;
    public elementType?: ElementType;
    public elementName?: string;
    public operator?: string;
    public expected?: string | number;
    public current?: string | number; // absent : valeur inconnue
    public sequenceId?: string; // condition de securite d'une sequence (cycle refuse : toutes ses sequences fausses)
    public sequenceName?: string;
    public error?: string; // conditions inevaluables (structure invalide) : raison technique
}

export class ProcessEventData {
    public type: string; // manual schedule trigger sensor
    public value?: ExecutableStatus | ExecutableAction;
    public status?: string;
    public startedAt?: Date;
    public duration?: number;
    public causes?: { type: string; cause: string }[];
    // statut WAITTING_CONFIRMATION uniquement : raison de l'attente (popin du front) ; complete par la
    // reponse (answer, waitMs...) sur les events suivants du run
    public confirmation?: EventConfirmationModel;

    // journal d'execution (absent des events anterieurs)
    public kind?: ProcessEventKind;
    public runId?: string;
    public name?: string; // nom de l'element au moment de l'event
    public cycleId?: string; // sequence : cycle proprietaire
    public origin?: EventOriginModel;
    public stop?: EventStopModel;
    public isForced?: boolean; // sequence lancee par FORCE_SEQUENCE
    public conditions?: string[]; // START_REFUSED / SEQUENCE_SKIPPED : conditions fausses
    public conditionCauses?: ConditionCauseModel[]; // idem, structurees
    public preempted?: string[]; // CYCLE_STARTED : cycles stoppes par ce demarrage
    public waitingFor?: string[]; // CYCLE_QUEUED : cycles dont la fin est attendue
    public runStartedAt?: Date;
    public endedAt?: Date;
    public realDuration?: number;
    public plannedDuration?: number;
    public sequences?: EventSequencesSummary;
    public inverter?: InverterEventDetail; // events INVERTER_*
    public message?: string;
}

export class SensorEventData {
    public value: string;
}

export class EventModel {
    public _id?: string;
    public date: Date;
    public elementId?: string; // remplace le deviceId, suivant le type cycle / sequence / sensor
    public elementType?: ElementType;
    public additionalData: ProcessEventData | SensorEventData;
    public createdAt?: Date;
}
