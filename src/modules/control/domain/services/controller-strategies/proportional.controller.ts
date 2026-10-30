import { Injectable } from '@nestjs/common';
import { ControlAlgorithm, ControllerMemory, PidParamsModel } from '../../models/control.model';
import { ControllerStrategy } from './controller-strategy.interface';

// correction incrémentale : la sortie avance de error * kP/10 à chaque itération
@Injectable()
export class ProportionalController implements ControllerStrategy {
    public readonly types = [ControlAlgorithm.P];

    public next(error: number, output: number, params: PidParamsModel, _memory: ControllerMemory, _dtMs: number): number {
        return output + error * (params.kP / 10);
    }
}
