import { ControlAlgorithm, ControllerMemory, PidParamsModel } from '../../models/control.model';

export const CONTROLLER_STRATEGIES = 'CONTROLLER_STRATEGIES';

export interface ControllerStrategy {
    // algorithmes pris en charge par la stratégie
    types: ControlAlgorithm[];
    // nouvelle sortie (non bornée) à partir de l'écart consigne - mesure et de la sortie courante
    next(error: number, output: number, params: PidParamsModel, memory: ControllerMemory, dtMs: number): number;
}
