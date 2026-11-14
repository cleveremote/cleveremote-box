import { Module } from '@nestjs/common';
import { ControlLoopRunner } from '@control/domain/services/control-loop-runner.service';
import { CONTROLLER_STRATEGIES, ControllerStrategy } from '@control/domain/services/controller-strategies/controller-strategy.interface';
import { ProportionalController } from '@control/domain/services/controller-strategies/proportional.controller';
import { PidController } from '@control/domain/services/controller-strategies/pid.controller';

// Module technique autonome (aucune dépendance à process) : algorithmes de régulation appliqués
// à un ControlPlant fourni par l'appelant (lecture de la mesure, écriture de la sortie).
@Module({
    providers: [
        ProportionalController,
        PidController,
        {
            provide: CONTROLLER_STRATEGIES,
            useFactory: (p: ProportionalController, pid: PidController): ControllerStrategy[] => [p, pid],
            inject: [ProportionalController, PidController]
        },
        ControlLoopRunner
    ],
    exports: [ControlLoopRunner]
})
export class ControlModule { }
