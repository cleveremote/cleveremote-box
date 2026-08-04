import { ExecutableAction, ExecutableStatus } from '../interfaces/executable.interface';

export enum ElementType {
    CYCLE = 'CYCLE',
    SEQUENCE = 'SEQUENCE',
    SENSOR = 'SENSOR'
}

export class ProcessEventData {
    public type: string; // manual schedule trigger sensor
    public value: ExecutableStatus | ExecutableAction;
    public status?: string;
    public startedAt?: Date;
    public duration?: number;
    public causes?: { type: string; cause: string }[];
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
