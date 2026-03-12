import { SensorType } from '../interfaces/sensor.interface';
export class ModbusTaskConfigModel {
    public id: string;
    public connectionId: string;
    public function: string;
    public label: string;
    public address: number;
    public params: {
        length?: number,
        scale?: number,
        unit?: string,
        value?:number
    };
}