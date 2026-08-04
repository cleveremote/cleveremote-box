import { ConditionModel } from './condition.model';
import { CycleModel } from './cycle.model';
import { DeviceModel } from './device.model';
import { ComRequestModel } from './com-request.model';
import { ActuatorModel } from './actuator.model';
import { ScheduleModel } from './schedule.model';
import { SensorModel } from './sensor.model';
import { SequenceModel } from './sequence.model';
import { TriggerModel } from './trigger.model';

export class SynchronizeSequenceModel extends SequenceModel {
    public delete?: boolean = false;
}

export class SynchronizeCycleModel extends CycleModel {
    public sequences: SynchronizeSequenceModel[] = [];
    public schedules?: SynchronizeScheduleModel[] = [];
    public triggers?: SynchronizeTriggerModel[] = [];
    public delete?: boolean = false;
}

export class SynchronizeScheduleModel extends ScheduleModel {
    public delete?: boolean = false;
}

export class SynchronizeTriggerModel extends TriggerModel {
    public delete?: boolean = false;
}

export class SynchronizeConditionModel extends ConditionModel {
}

export class SynchronizeSensorModel extends SensorModel {
    public delete?: boolean = false;
}

export class SynchronizeDeviceModel extends DeviceModel {
    public delete?: boolean = false;
    // devices imbriques (slaves) et comrequests imbriques : uniquement presents lors d'une synchro
    // recursive via box/synchronize/device ; undefined = non fourni, ne cascade pas (retro-compat).
    public devices?: SynchronizeDeviceModel[];
    public comrequests?: SynchronizeComRequestModel[];
}

export class SynchronizeComRequestModel extends ComRequestModel {
    public delete?: boolean = false;
}

export class SynchronizeActuatorModel extends ActuatorModel {
    public delete?: boolean = false;
}
