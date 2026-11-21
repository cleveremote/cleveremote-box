import { Observable } from 'rxjs';
import { ActuatorModel } from '../../models/actuator.model';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ControlValueEventDetail } from '../../models/event.model';

export const ACTUATOR_STRATEGIES = 'ACTUATOR_STRATEGIES';

export interface ActuatorSetOptions {
    // CTRL : `action` est une consigne explicite (customValue d'une séquence hors cycle PROPORTIONAL, ou son OFF) :
    // positionnement direct, prioritaire sur la ControlLoop de la vanne (pas de suivi ni de régulation)
    isDirect?: boolean;
}

// variation de commande d'un actionneur, agregee de la premiere a la derniere ecriture (CTRL : ouverture en %,
// arrondie au dixieme ; cf. CtrlActuatorStrategy)
export type ActuatorValueChange = Omit<ControlValueEventDetail, 'actuatorName'> & { name: string };

export interface ActuatorStrategy {
    type: ActuatorType;
    // variations de commande agregees (CTRL : regulation, suivi, consigne) ; absent : non publiees
    valueChanged$?: Observable<ActuatorValueChange>;
    init(actuator: ActuatorModel): Promise<void>;
    set(actuator: ActuatorModel, action: number, options?: ActuatorSetOptions): Promise<void>;
    read(actuator: ActuatorModel): Promise<number>;
    // remise à l'état d'arrêt (commandes reset de l'actionneur, à défaut set 0)
    reset(actuator: ActuatorModel): Promise<void>;
}
