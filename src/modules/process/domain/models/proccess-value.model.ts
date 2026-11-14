import { CauseType, ExecutableStatus } from '../interfaces/executable.interface';
import { ExecutableType } from './value.model';
import { ProcessLastEventModel } from './event.model';

export class ProcessValueModel {
    public id: string;
    public type: ExecutableType;
    public status: ExecutableStatus;
    public startedAt?: Date;
    public duration?: number;
    public causes?: { type: CauseType; cause: string }[];
    public lastEvent?: ProcessLastEventModel;
}