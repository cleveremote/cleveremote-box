import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ControlAlgorithm, ControllerMemory, ControlPlant, ControlResult, PidParamsModel } from '../models/control.model';
import { CONTROLLER_STRATEGIES, ControllerStrategy } from './controller-strategies/controller-strategy.interface';

@Injectable()
export class ControlLoopRunner {

    public constructor(
        private readonly logger: Logger,
        @Inject(CONTROLLER_STRATEGIES) private readonly strategies: ControllerStrategy[]
    ) { }

    /**
     * Boucle fermée : lit la mesure, corrige la sortie (bornée à [plant.min, plant.max]) et l'applique,
     * jusqu'à ce que l'écart soit dans la tolérance ou que le nombre d'itérations max soit atteint.
     * Entre deux itérations, attend iterationDelayMs + le temps que met l'organe à appliquer la correction.
     */
    public async run(plant: ControlPlant, algorithm: ControlAlgorithm, params: PidParamsModel, setpoint: number): Promise<ControlResult> {
        const controller = this._resolveStrategy(algorithm);
        const memory: ControllerMemory = { integral: 0, previousError: null };
        let lastAt = Date.now();
        let result: ControlResult;

        for (let iteration = 1; iteration <= params.maxIterations; iteration++) {
            const measured = await plant.read();
            const error = setpoint - measured;
            const isStabilized = Math.abs(error) <= params.tolerance;
            const outputBefore = plant.current();

            if (!isStabilized) {
                const now = Date.now();
                const next = controller.next(error, outputBefore, params, memory, now - lastAt);
                lastAt = now;
                await plant.write(Math.min(plant.max, Math.max(plant.min, next)));
            }

            result = { setpoint, measured, output: plant.current(), isStabilized, iterations: iteration };
            this.logger.debug({ algorithm, ...result }, 'control loop step');
            if (isStabilized) break;
            await this._delay(params.iterationDelayMs + plant.settleMs(plant.current() - outputBefore));
        }

        return result;
    }

    private _resolveStrategy(algorithm: ControlAlgorithm): ControllerStrategy {
        const strategy = this.strategies.find((candidate) => candidate.types.includes(algorithm));
        if (!strategy) {
            throw new Error(`ControlLoopRunner: unsupported control algorithm "${algorithm}"`);
        }
        return strategy;
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

}
