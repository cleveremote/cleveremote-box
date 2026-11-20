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
    // cycle PROPORTIONAL uniquement : ouverture (%) commandee par le cycle a sa vanne, 0 a l'arret ; compare par
    // les conditions numeriques (cf. evaluateConditions). Pas `value` : reserve aux SensorValueModel (detection capteur)
    public percent?: number;
}