import { ModuleModel } from '../models/module.model';
import { SequenceModel } from '../models/sequence.model';


export enum ExecutableStatus {
    IN_PROCCESS = 'IN_PROCCESS',
    STOPPED = 'STOPPED',
    WAITTING_CONFIRMATION = 'WAITTING_CONFIRMATION'
}

export enum ExecutableAction {
    ON = 'ON',
    OFF = 'OFF'
}

export enum ProcessMode {
    SCHEDULED = 'SCHEDULED',
    MANUAL = 'MANUAL',
    TRIGGER = 'TRIGGER'
}

export enum ProcessType {
    //
    INIT = 'INIT', // declenchement initial 
    FORCE = 'FORCE', // deduction par rapport au priorite ou par confirmation
    QUEUED = 'QUEUED', // par confirmation
    CONFIRMATION = 'CONFIRMATION',
    IGNORE = 'IGNORE', //par confirmation
    SKIP = 'SKIP' // concerne les sequences ...
}

export enum TASK {
    DATE = 'DATE',
    SENSOR = 'SENSOR',
    RECURSIVE = 'RECURSIVE'
}

export interface IExecutable {
    id: string;
    name: string;
    status: ExecutableStatus;
    sequences: SequenceModel[];
    modePriority: { mode: ProcessMode; priority: number }[];
    reset(): Promise<void>;
    getModules(): ModuleModel[];
    exists(module: ModuleModel): boolean;
    getExecutionStructure(duration: number): { sequenceId: string; portNums: number[]; duration: number }[];
}