import { ExecutableAction, ExecutableStatus } from '../interfaces/executable.interface';
import { ConfirmationRequestModel } from './confirmation-request.model';

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
    // statut WAITTING_CONFIRMATION uniquement : raison de l'attente (popin du front)
    public confirmation?: ConfirmationRequestModel;
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
