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
    // DeviceCommand (register map) exécutée avec la valeur de l'action
    public commandId: string;
    // Voie (0-based) qui surcharge celle de la commande
    public channel?: number;
}

export class ActuatorConfigModel {
    // Slave sur lequel les actions sont exécutées
    public deviceId: string;
    public actions: ActuatorActionConfig[];
}

export class ComActuatorConfigModel extends ActuatorConfigModel {
}

// paramètres physiques de la vanne uniquement : la régulation (capteur de retour, algorithme,
// consigne) est portée par ControlLoopModel (cf. RegulationService).
export class CtrlActuatorConfigModel extends ComActuatorConfigModel {

    public channel: number;
    public minOpening: number = 0;
    public maxOpening: number = 100;
    public openingPercent: number = 0;
    // temps que met la vanne pour parcourir toute sa course (minOpening <-> maxOpening), en ms.
    public fullStrokeMs: number = 7000;
    public valveType: string = 'PROPORTIONAL';
    // valeurs brutes de la sortie analogique (unité de la commande set, ex: mV ou µA) correspondant
    // à 0% et 100% d'ouverture (ex: 4000/20000 µA en 4-20mA) ; à défaut, plage de saisie de la commande.
    public minOutputValue?: number;
    public maxOutputValue?: number;

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
