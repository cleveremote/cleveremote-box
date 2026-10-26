import { ActuatorModel } from '../../models/actuator.model';
import { ActuatorType } from '../../interfaces/actuator-module.interface';

export const ACTUATOR_STRATEGIES = 'ACTUATOR_STRATEGIES';

export interface ActuatorStrategy {
    type: ActuatorType;
    init(actuator: ActuatorModel): Promise<void>;
    set(actuator: ActuatorModel, action: number): Promise<void>;
    read(actuator: ActuatorModel): Promise<number>;
    // remise à l'état d'arrêt (commandes reset de l'actionneur, à défaut set 0)
    reset(actuator: ActuatorModel): Promise<void>;
}
