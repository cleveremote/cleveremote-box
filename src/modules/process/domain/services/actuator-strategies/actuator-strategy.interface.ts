import { ActuatorModel } from '../../models/actuator.model';
import { ActuatorType } from '../../interfaces/actuator-module.interface';

export const ACTUATOR_STRATEGIES = 'ACTUATOR_STRATEGIES';

export interface ActuatorStrategy {
    type: ActuatorType;
    configure(actuator: ActuatorModel): Promise<void>;
    execute(actuator: ActuatorModel, action: number): Promise<void>;
    read(actuator: ActuatorModel): number;
}
