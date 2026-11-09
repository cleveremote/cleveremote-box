import { IActuatorModule } from './actuator-module.interface';
import { SequenceModel } from '../models/sequence.model';
import { SecurityConfig } from '@process/infrastructure/schemas/sequence.schema';


export enum ExecutableStatus {
    IN_PROCCESS = 'IN_PROCCESS',
    STOPPED = 'STOPPED',
    WAITTING_CONFIRMATION = 'WAITTING_CONFIRMATION',
    QUEUED = 'QUEUED' // en attente de la fin des cycles en conflit (StartPolicy.QUEUE)
}

// notification ponctuelle envoyee au front (sans changer le statut de l'element)
export enum ProcessNotification {
    CONDITIONS_NOT_VERIFIED = 'CONDITIONS_NOT_VERIFIED'
}

export enum ExecutableAction {
    ON = 'ON',
    OFF = 'OFF'
}

// origine d'un process (qui l'a declenche). Un process pilote par un autre cycle (regle 2, enfant
// de Group) herite de l'origine de ce cycle et porte son id dans ProcessModel.sourceCycleId.
// SYSTEM : arret interne (enfant stoppe par son Group, Group eteint, conflit perdu), sans rang.
export enum ProcessMode {
    SCHEDULE = 'SCHEDULE',
    MANUAL = 'MANUAL',
    TRIGGER = 'TRIGGER',
    SYSTEM = 'SYSTEM'
}

// origines comparees par l'arbitrage (rang dans GlobalSettingsModel.modeRanks)
export type RankedProcessMode = ProcessMode.MANUAL | ProcessMode.SCHEDULE | ProcessMode.TRIGGER;

export enum CycleType {
    GROUP = 'GROUP',
    CYCLE = 'CYCLE',
    MODULE = 'MODULE',
}

export enum ExecutionMode {
    SEQUENTIAL = 'SEQUENTIAL',
    PARALLEL = 'PARALLEL'
}

// comment un process de cycle doit demarrer face aux cycles en conflit (actuator partage)
export enum StartPolicy {
    ARBITRATE = 'ARBITRATE', // compare les rangs : gagne -> FORCE, perd ou egalite -> confirmation du front
    FORCE = 'FORCE', // demarre tout de suite en stoppant les cycles en conflit
    QUEUE = 'QUEUE' // attend la fin des cycles en conflit sans les interrompre
}

// commandes envoyees par le front sur une sequence d'un cycle en cours
export enum SequenceCommand {
    SKIP = 'SKIP', // termine la sequence en cours, passe a la suivante
    FORCE = 'FORCE' // sequence sautee (conditions fausses) lancee des la fin de la sequence en cours
}

// nature d'une cause envoyee au front avec un statut (valeurs historiques du protocole)
export enum CauseType {
    FORCE = 'FORCE',
    CONFIRMATION = 'CONFIRMATION',
    QUEUED = 'QUEUED'
}

export enum TASK {
    DATE = 'DATE',
    SENSOR = 'SENSOR',
    RECURSIVE = 'RECURSIVE'
}

export type SequenceExecutionEntry = { sequenceId: string; moduleIds: string[]; securityConfig: SecurityConfig };

export interface IExecutable {
    _id: string;
    name: string;
    type: CycleType;
    status: ExecutableStatus;
    sequences?: SequenceModel[];
    getModuleIds(): string[];
    getModules(actuatorRegistry: Map<string, IActuatorModule>): IActuatorModule[];
    exists(module: IActuatorModule, actuatorRegistry: Map<string, IActuatorModule>): boolean;
    getExecutionStructure(duration: number, actuatorRegistry: Map<string, IActuatorModule>): SequenceExecutionEntry[];
}