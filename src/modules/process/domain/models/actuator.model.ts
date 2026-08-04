import { Gpio } from 'onoff';
import { GPIODirection, GPIOEdge, ModuleStatus } from '../interfaces/structure.interface';
import { IActuatorModule, ActuatorType } from '../interfaces/actuator-module.interface';

export { ActuatorType };

export type FakeGpio = { writeSync: (_value: number) => void; direction: () => GPIODirection; unexport: () => void; readSync: () => number };

export class RpiActuatorConfigModel {
    public instance?: Gpio | FakeGpio;
    public rpiPin: number;
    public direction: GPIODirection;
    public edge: GPIOEdge;
    public debounceTimeout?: number = undefined;
    public activeLow?: boolean = false;
    public reconfigureDirection?: boolean = true;
}

export class ActuatorActionConfig {
    public comRequestId: string;
    public portNumber: number;
}

export class ActuatorConfigModel {
    public deviceId: string;
    public actions: ActuatorActionConfig[];
}

export class ComActuatorConfigModel extends ActuatorConfigModel {
}

export class CtrlActuatorConfigModel extends ComActuatorConfigModel {

    public channel: number;
    public flowMeterId: string;
    public maxFlowRate: number = 100;
    public kP: number = 5;
    public minOpening: number = 0;
    public maxOpening: number = 100;
    public openingPercent: number = 0;
    public tolerance: number = 1;
    public maxIterations: number = 20;
    public iterationDelayMs: number = 500;
    // temps que met la vanne pour parcourir toute sa course (minOpening <-> maxOpening), en ms.
    public fullStrokeMs: number = 7000;
    public valveType: string = 'PROPORTIONAL';

}

export class ActuatorModel implements IActuatorModule {
    public _id: string;
    public status: ModuleStatus;
    public name: string;
    public description?: string;
    public type: ActuatorType;
    public config: RpiActuatorConfigModel | ComActuatorConfigModel | CtrlActuatorConfigModel;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
