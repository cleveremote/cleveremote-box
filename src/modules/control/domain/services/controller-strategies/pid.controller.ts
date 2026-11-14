import { Injectable } from '@nestjs/common';
import { ControlAlgorithm, ControllerMemory, PidParamsModel } from '../../models/control.model';
import { ControllerStrategy } from './controller-strategy.interface';

// même forme incrémentale que ProportionalController (kI = kD = 0 -> comportement P identique),
// complétée des termes intégral (écart cumulé, en secondes) et dérivé (variation de l'écart / s).
// PI : kD ignoré.
@Injectable()
export class PidController implements ControllerStrategy {
    public readonly types = [ControlAlgorithm.PI, ControlAlgorithm.PID];

    public next(error: number, output: number, params: PidParamsModel, memory: ControllerMemory, dtMs: number): number {
        const dtS = dtMs / 1000;
        memory.integral += error * dtS;
        const derivative = memory.previousError !== null && dtS > 0 ? (error - memory.previousError) / dtS : 0;
        memory.previousError = error;
        const kD = params.kD ?? 0;
        return output + (params.kP * error + (params.kI ?? 0) * memory.integral + kD * derivative) / 10;
    }
}
