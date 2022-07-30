import { ModuleModel } from '../models/module.model';
import { SequenceModel } from '../models/sequence.model';


export enum ExecutableStatus {
    IN_PROCCESS = 'IN_PROCCESS',
    STOPPED = 'STOPPED'
}

export enum ExecutableAction {
    ON = 'ON',
    OFF = 'OFF'
}

export enum ExecutableMode {
    NORMAL = 'NORMAL',
    FORCE = 'FORCE',
    QUEUED = 'QUEUED',
    SCHEDULED = 'SCHEDULED'
}

export enum ConditionType {
    NOW = 'NOW',
    DATE = 'DATE',
    SENSOR = 'SENSOR',
    RECURSIVE = 'RECURSIVE'
}

export enum ExecutableType {
    CYCLE = 'CYCLE',
    SEQUENCE = 'SEQUENCE'
}

export enum TASK {
    DATE = 'DATE',
    SENSOR = 'SENSOR',
    RECURSIVE = 'RECURSIVE'
}

export interface IExecutable {
    id: string;
    status: ExecutableStatus;
    sequences: SequenceModel[];
    reset(): Promise<void>;
    getModules(): ModuleModel[];
    exists(module: ModuleModel): boolean;
    getExecutionStructure(duration: number): { sequenceId: string; portNums: number[]; duration: number }[];
}