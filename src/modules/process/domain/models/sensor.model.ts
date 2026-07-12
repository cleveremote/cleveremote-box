import { SensorType } from '../interfaces/sensor.interface';

export class ComSensorConfigModel {
    public cronPattern: string;
    public comRequestId: string;
}

export enum forcastDataName {
  TEMPERATURE_2M_MAX = 'temperature_2m_max',
  TEMPERATURE_2M_MIN = 'temperature_2m_min'
}


export class ForcastSensorConfigModel {
    public cronPattern: string;
    public forcastData: forcastDataName;
}

export class SensorModel {
    public id: string;
    public name: string;
    public description: string;
    public style: { bgColor: string; fontColor: string; iconColor: { base: string; icon: string } };
    public type: SensorType;
    public config: ForcastSensorConfigModel | ComSensorConfigModel;

    public value?: number;
    public date?: Date;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
