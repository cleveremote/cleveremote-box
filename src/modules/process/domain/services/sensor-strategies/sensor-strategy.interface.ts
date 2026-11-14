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
    read(sensor: SensorModel, isFromLoopCtrl?:boolean): Promise<ReadResult>;
    // sensor enfant : valeur extraite de la lecture du parent, transformée selon la config de l'enfant (absent = brute)
    transform?(sensor: SensorModel, item: ReadResultItem, isFromLoopCtrl?:boolean): ReadResultItem;
}
