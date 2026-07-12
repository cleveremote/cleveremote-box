import { ProcessValueModel } from './proccess-value.model';
import { SensorValueModel } from './sensor-value.model';

export enum ExecutableType {
    CYCLE = 'CYCLE',
    SEQUENCE = 'SEQUENCE',
    TASK = 'TASK'
}

export class ValueModel {
    public processes: ProcessValueModel[];
    public sensors: SensorValueModel[];
}