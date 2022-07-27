import { CycleModel } from './cycle.model';
import { ModuleModel } from './module.model';
import { SequenceModel } from './sequence.model';

export class SynchronizeModuleModel extends ModuleModel {
    public shouldDelete: boolean;
}

export class SynchronizeSequenceModel extends SequenceModel {
    public modules: SynchronizeModuleModel[] = [];
    public shouldDelete: boolean;
}

export class SynchronizeCycleModel extends CycleModel {
    public sequences: SynchronizeSequenceModel[] = [];
    public shouldDelete: boolean;
}
