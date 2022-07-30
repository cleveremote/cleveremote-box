import { Subscription } from 'rxjs';
import {
    ExecutableAction,
    ExecutableMode,
    ConditionType,
    IExecutable
} from '../interfaces/executable.interface';
import { ScheduleModel } from './schedule.model';

export class ProcessModel {
    public cycle: IExecutable;
    public action: ExecutableAction;
    public type: ConditionType;
    public function: string;
    public mode: ExecutableMode;
    public instance: Subscription;
    public duration?: number;
    public schedule: ScheduleModel;
}
