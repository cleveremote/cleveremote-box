import { Subscription } from 'rxjs';
import {
    ExecutableAction,
    ProcessMode,
    ProcessType,
    IExecutable
} from '../interfaces/executable.interface';
import { ScheduleModel } from './schedule.model';
import { CycleModel } from './cycle.model';

export class ProcessModel {
    public id: string;
    public cycle: CycleModel; //on run ?
    public action: ExecutableAction;
    public type: ProcessType;
    public mode: ProcessMode;
    public instance: Subscription;
    public duration?: number;
    public schedule: ScheduleModel;
}