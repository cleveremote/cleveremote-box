import { SensorModel } from '../../models/sensor.model';
import { SensorType } from '../../interfaces/sensor.interface';

export const SENSOR_STRATEGIES = 'SENSOR_STRATEGIES';

export interface ReadResultItem {
    value: number;
    isFormated: boolean;
    unit?: string;
    name: string;
}

export type ReadResult = ReadResultItem[];

export interface SensorStrategy {
    type: SensorType;
    read(sensor: SensorModel): Promise<ReadResult>;
}
