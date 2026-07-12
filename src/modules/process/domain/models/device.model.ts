import { SensorType } from '../interfaces/sensor.interface';

export enum MasterProtocol {
    TCP = 'TCP',
    RTU = 'RTU',
}

export enum DeviceType {
    MASTER = 'MASTER',
    SLAVE = 'SLAVE',
}

export class MasterConfigModel {
    public protocol: MasterProtocol;
    ipAddress?: string;
    port?: number;
    baudRate?: number;
    path?:string;
    timeout?: number;
}

export class SlaveConfigModel {
    public slaveId: string;
    public masterDeviceId?: string;
}

export class DeviceModel {
    public _id: string;
    public name: string;
    public type: DeviceType;
    public description: string;
    public config: MasterConfigModel | SlaveConfigModel;
    
    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}