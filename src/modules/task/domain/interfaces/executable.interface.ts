import { CycleModel } from '../models/cycle.model';
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
    QUEUED = 'QUEUED'
}

export enum ConditionType {
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
    status:ExecutableStatus;
    execute(action: ExecutableAction): Promise<boolean>;
    reset(): Promise<boolean>;
    getModules(): ModuleModel[];
    getChilds():SequenceModel[]|CycleModel[]|ModuleModel[];
    getType():ExecutableType;
    exists(module: ModuleModel): boolean;
    getExecutionStructure():{ portNum: number[], duration: number }[];
    
}