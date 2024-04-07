import { BehaviorSubject } from 'rxjs';
import { SensorType } from '../interfaces/sensor.interface';

export class SensorModel {
    public id: string;
    public name: string;
    public description: string;
    public type: SensorType;
    public unit: string;
}