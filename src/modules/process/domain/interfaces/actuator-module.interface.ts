import { ModuleStatus } from './structure.interface';

export enum ActuatorType {
    RPI = 'RPI',
    COM = 'COM',
    CTRL = 'CTRL'
}

export interface IActuatorModule {
    _id: string;
    status: ModuleStatus;
    name: string;
    description?: string;
    type: ActuatorType;

    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
}
