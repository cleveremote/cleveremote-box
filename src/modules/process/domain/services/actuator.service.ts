import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NotImplementedError } from '../errors/not-implemented.error';
import { IActuatorModule, ActuatorType } from '../interfaces/actuator-module.interface';
import { ActuatorModel } from '../models/actuator.model';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ACTUATOR_STRATEGIES, ActuatorStrategy } from './actuator-strategies/actuator-strategy.interface';

@Injectable()
export class ActuatorService {

    private readonly _strategies: Map<ActuatorType, ActuatorStrategy>;

    public constructor(
        private readonly logger: Logger,
        private actuatorRepository: ActuatorRepository,
        @Inject(ACTUATOR_STRATEGIES) strategies: ActuatorStrategy[]
    ) {
        this._strategies = new Map(strategies.map((strategy) => [strategy.type, strategy]));
    }

    public async resolve(moduleIds: string[]): Promise<Map<string, IActuatorModule>> {
        const uniqueIds = [...new Set(moduleIds)];
        const actuators = await this.actuatorRepository.findByIds(uniqueIds);
        return new Map(actuators.map((actuator) => [actuator._id, actuator]));
    }

    public async execute(actuator: IActuatorModule, action: number): Promise<void> {
        return this._resolveStrategy(actuator.type).execute(actuator as ActuatorModel, action);
    }

    public async reset(actuators: IActuatorModule[]): Promise<void> { 
        for (const actuator of actuators) {
            try {
                await this.execute(actuator, 0);
            } catch (error) {
                this.logger.warn({ error, name: actuator.name }, 'reset actuator error');
            }
        }
    }

    private _resolveStrategy(type: ActuatorType): ActuatorStrategy {
        const strategy = this._strategies.get(type);
        if (!strategy) {
            throw new NotImplementedError(`ActuatorService: unsupported actuator type "${type}"`);
        }
        return strategy;
    }

}
