import { ExecutableStatus } from '../interfaces/executable.interface';
import { ProcessValueModel } from './proccess-value.model';
import { SensorValueModel } from './sensor-value.model';

export enum ExecutableType {
    CYCLE = 'CYCLE',
    SEQUENCE = 'SEQUENCE'
}

export enum ReadableType {
    SENSOR = 'SENSOR'
}

export type ReadableElementType = ReadableType | ExecutableType;

export interface ISensorValue {
    id: string;
    type: ReadableElementType;
    value: number;
}

export interface IExecutableState {
    id: string;
    type: ReadableElementType;
    status: ExecutableStatus;
    startedAt: Date;
    duration: number;
}

export interface IValueResponse {
    id: string;
    type: ReadableElementType;
    value: number | ExecutableStatus;
}

export class ValueModel {
    public processes: ProcessValueModel[];
    public sensors: SensorValueModel[];
}