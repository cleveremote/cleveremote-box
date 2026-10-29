import { IActuatorModule } from './actuator-module.interface';
import { SequenceModel } from '../models/sequence.model';
import { SecurityConfig } from '@process/infrastructure/schemas/sequence.schema';


export enum ExecutableStatus {
    IN_PROCCESS = 'IN_PROCCESS',
    STOPPED = 'STOPPED',
    WAITTING_CONFIRMATION = 'WAITTING_CONFIRMATION',
    QUEUED = 'QUEUED' // en attente de la fin des cycles en conflit (ProcessType.QUEUED)
}

// notification ponctuelle envoyee au front (sans changer le statut de l'element)
export enum ProcessNotification {
    CONDITIONS_NOT_VERIFIED = 'CONDITIONS_NOT_VERIFIED'
}

export enum ExecutableAction {
    ON = 'ON',
    OFF = 'OFF'
}

export enum ProcessMode {
    SCHEDULED = 'SCHEDULE',
    MANUAL = 'MANUAL',
    TRIGGER = 'TRIGGER',
    AUTO = 'AUTO',
    SYSTEM = 'SYSTEM'
}

export enum CycleType {
    GROUP = 'GROUP',
    CYCLE = 'CYCLE',
    MODULE = 'MODULE',
}

export enum ExecutionMode {
    SEQUENTIAL = 'SEQUENTIAL',
    PARALLEL = 'PARALLEL'
}

export enum ProcessType {
    //
    INIT = 'INIT', // declenchement initial
    FORCE = 'FORCE', // deduction par rapport au priorite ou par confirmation
    QUEUED = 'QUEUED', // par confirmation : demarre des la fin des cycles en conflit
    CONFIRMATION = 'CONFIRMATION',
    IGNORE = 'IGNORE', //par confirmation
    SKIP = 'SKIP', // concerne les sequences ...
    FORCE_SEQUENCE = 'FORCE_SEQUENCE' // sequence sautee (conditions fausses) lancee des la fin de la sequence en cours
}

export enum TASK {
    DATE = 'DATE',
    SENSOR = 'SENSOR',
    RECURSIVE = 'RECURSIVE'
}

export type SequenceExecutionEntry = { sequenceId: string; names: string[]; securityConfig: SecurityConfig };

export interface IExecutable {
    _id: string;
    name: string;
    type: CycleType;
    status: ExecutableStatus;
    sequences?: SequenceModel[];
    modePriority: { mode: ProcessMode; priority: number }[];
    getModuleIds(): string[];
    getModules(actuatorRegistry: Map<string, IActuatorModule>): IActuatorModule[];
    exists(module: IActuatorModule, actuatorRegistry: Map<string, IActuatorModule>): boolean;
    getExecutionStructure(duration: number, actuatorRegistry: Map<string, IActuatorModule>): SequenceExecutionEntry[];
}