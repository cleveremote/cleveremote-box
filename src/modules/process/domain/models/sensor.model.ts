import { SensorType } from '../interfaces/sensor.interface';
export class SensorModel {
    public id: string;
    public name: string;
    public description: string;
    public style: { bgColor: string; fontColor: string; iconColor: { base: string, icon: string } };
    public type: SensorType;
    public unit: string;
    public getValue(value: any): number {
        switch (this.type) {
            case SensorType.LOCAL_TEMPERATURE:
                return Number(value.temperature)
            case SensorType.LOCAL_HUMIDITY:
                return Number(value.humidity)
            case SensorType.FORCAST_TEMPERATURE_MAX:
            case SensorType.FORCAST_TEMPERATURE_MIN:
                return Number(value)
        }
    }
}