import { SensorType } from '../interfaces/sensor.interface';
export class ModbusConnectionConfigModel {
    public id: string;
    public ipAddress: string;
    public protocol: string;
    public port: number;
    public path: string;
    public slaveId: number;
    public timeout: number;
    public baudrate: number;
    }