import { SensorType } from '../interfaces/sensor.interface';
export class SensorModel {
    public id: string;
    public name: string;
    public description: string;
    public style: { bgColor: string; fontColor: string; iconColor: { base: string, icon: string } };
    public type: SensorType;
    public unit: string;
}