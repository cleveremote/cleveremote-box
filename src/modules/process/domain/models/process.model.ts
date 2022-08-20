import { Subscription } from 'rxjs';
import {
    ExecutableAction,
    ProcessMode,
    ProcessType,
    IExecutable
} from '../interfaces/executable.interface';
import { ScheduleModel } from './schedule.model';

export class ProcessModel {
    public id: string;
    public cycle: IExecutable;
    public action: ExecutableAction;
    public type: ProcessType;
    public function: string;
    public mode: ProcessMode;
    public instance: Subscription;
    public duration?: number;
    public schedule: ScheduleModel;
}
