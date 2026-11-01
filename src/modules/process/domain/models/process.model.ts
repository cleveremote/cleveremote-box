import { Subscription } from 'rxjs';
import {
    ExecutableAction,
    ProcessMode,
    StartPolicy
} from '../interfaces/executable.interface';
import { ScheduleModel } from './schedule.model';
import { CycleModel } from './cycle.model';

export class ProcessModel {
    public id: string;
    public cycle: CycleModel; //on run ?
    public action: ExecutableAction;
    public policy: StartPolicy;
    // origine du declenchement ; herite du cycle source quand celui-ci pilote ce process
    public mode: ProcessMode;
    public instance: Subscription;
    public duration?: number;
    public schedule: ScheduleModel;
    // cycle a l'origine de ce process. Avec un mode autre que SYSTEM : ce process est pilote par
    // ce cycle (regle 2 CYCLE -> MODULE, enfant demarre par son Group), cf. ProcessService._isDriven ;
    // en SYSTEM : arret demande par ce cycle (enfant stoppe par son Group).
    public sourceCycleId?: string;
}
