import { delay, from, map, mergeMap, Observable, of, Subscription, tap } from 'rxjs';
import {
    ExecutableAction,
    ExecutableMode,
    ConditionType,
    IExecutable,
    ExecutableStatus
} from '../interfaces/executable.interface';

export class ProcessModel {
    public cycle: IExecutable;
    public action: ExecutableAction;
    public type: ConditionType;
    public function: string;
    public mode: ExecutableMode;
    public instance: Subscription;
    public duration?: number;

    
}
