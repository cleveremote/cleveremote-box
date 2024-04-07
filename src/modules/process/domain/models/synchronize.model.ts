import { ConditionModel } from './condition.model';
import { CycleModel } from './cycle.model';
import { ModuleModel } from './module.model';
import { ScheduleModel } from './schedule.model';
import { SensorModel } from './sensor.model';
import { SequenceModel } from './sequence.model';
import { TriggerModel } from './trigger.model';

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

export class SynchronizeScheduleModel extends ScheduleModel {
    public shouldDelete: boolean;
}

export class SynchronizeTriggerModel extends TriggerModel {
    public shouldDelete: boolean;
}

export class SynchronizeConditionModel extends ConditionModel {
    public shouldDelete: boolean;
}

export class SynchronizeSensorModel extends SensorModel {
    public shouldDelete: boolean;
}
