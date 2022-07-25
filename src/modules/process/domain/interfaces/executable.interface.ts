import { ModuleModel } from '../models/module.model';


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
    QUEUED = 'QUEUED'
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
    reset(): Promise<boolean>;
    getModules(): ModuleModel[];
    exists(module: ModuleModel): boolean;
    getExecutionStructure(duration: number): { sequenceId: string; portNums: number[]; duration: number }[];
}