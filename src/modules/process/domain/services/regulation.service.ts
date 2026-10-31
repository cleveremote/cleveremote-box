import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ControlLoopRunner } from '@control/domain/services/control-loop-runner.service';
import { ControlPlant, ControlResult } from '@control/domain/models/control.model';
import { ControlLoopRepository } from '@process/infrastructure/repositories/control-loop.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { ActuatorType, IActuatorModule } from '../interfaces/actuator-module.interface';
import { ActuatorModel, CtrlActuatorConfigModel } from '../models/actuator.model';
import { ControlLoopModel } from '../models/control-loop.model';
import { ComSensorConfigModel, SensorModel } from '../models/sensor.model';
import { SensorType } from '../interfaces/sensor.interface';
import { ComSensorStrategy } from './sensor-strategies/com-sensor.strategy';
import { AnalogSensorStrategy } from './sensor-strategies/analog-sensor.strategy';
import { SensorStrategy } from './sensor-strategies/sensor-strategy.interface';

// pilotage de l'actionneur fourni par sa stratégie (CtrlActuatorStrategy) : évite toute dépendance inverse
export type ActuatorPort = Pick<ControlPlant, 'write' | 'settleMs'>;

// suivi en cours d'un actionneur (mode FOLLOW) ; active passe à false à l'arrêt pour neutraliser une itération en vol
type FollowState = { active: boolean; timer?: NodeJS.Timeout };

// Adaptateur process <-> control : expose un actionneur CTRL et le sensor de retour d'une ControlLoop
// sous forme de ControlPlant, puis délègue la régulation au module control.
@Injectable()
export class RegulationService {

    private readonly _follows = new Map<string, FollowState>();

    public constructor(
        private readonly logger: Logger,
        private controlLoopRepository: ControlLoopRepository,
        private sensorRepository: SensorRepository,
        private comSensorStrategy: ComSensorStrategy,
        private analogSensorStrategy: AnalogSensorStrategy,
        private controlLoopRunner: ControlLoopRunner
    ) { }

    // seuls les actionneurs CTRL sont régulables
    public async findLoop(actuator: IActuatorModule): Promise<ControlLoopModel | null> {
        if (actuator.type !== ActuatorType.CTRL) {
            return null;
        }
        return this.controlLoopRepository.getEnabledForActuator(actuator._id);
    }

    public async regulate(actuator: ActuatorModel, loop: ControlLoopModel, port: ActuatorPort): Promise<ControlResult> {
        const sensor = await this._resolveFeedbackSensor(loop.sensorId);
        const result = await this.controlLoopRunner.run(this._plant(actuator, sensor, port), loop.algorithm, loop.params, loop.setpoint);
        this.logger.log({ controlLoopId: loop._id, actuatorId: actuator._id, sensorId: loop.sensorId, ...result }, 'control loop finished');
        return result;
    }

    /**
     * Mode FOLLOW : l'ouverture recopie la mesure du sensor (ex: potentiomètre), projetée de
     * [follow.inputMin, follow.inputMax] sur [0, 100]%, toutes les params.iterationDelayMs jusqu'à stopFollow().
     * Non bloquant (contrairement à regulate) : la séquence continue pendant le suivi.
     */
    public async follow(actuator: ActuatorModel, loop: ControlLoopModel, port: ActuatorPort): Promise<void> {
        this.stopFollow(actuator._id);
        const state: FollowState = { active: true };
        this._follows.set(actuator._id, state);
        const plant = this._plant(actuator, await this._resolveFeedbackSensor(loop.sensorId), port);
        const { inputMin, inputMax, deadband } = loop.follow;

        const tick = async (): Promise<void> => {
            try {
                const measured = await plant.read();
                if (state.active && Number.isFinite(measured) && inputMax !== inputMin) {
                    const target = ((measured - inputMin) / (inputMax - inputMin)) * 100;
                    const output = Math.min(plant.max, Math.max(plant.min, target));
                    if (Math.abs(output - plant.current()) >= deadband) {
                        await plant.write(output);
                    }
                }
            } catch (error) {
                this.logger.warn({ error, controlLoopId: loop._id, actuatorId: actuator._id }, 'control loop follow step failed');
            }
            if (state.active) {
                state.timer = setTimeout(tick, loop.params.iterationDelayMs);
            }
        };

        this.logger.log({ controlLoopId: loop._id, actuatorId: actuator._id, sensorId: loop.sensorId }, 'control loop follow started');
        await tick();
    }

    public stopFollow(actuatorId: string): void {
        const state = this._follows.get(actuatorId);
        if (!state) {
            return;
        }
        state.active = false;
        clearTimeout(state.timer);
        this._follows.delete(actuatorId);
        this.logger.log({ actuatorId }, 'control loop follow stopped');
    }

    private _plant(actuator: ActuatorModel, sensor: SensorModel, port: ActuatorPort): ControlPlant {
        const config = actuator.config as CtrlActuatorConfigModel;
        return {
            min: config.minOpening,
            max: config.maxOpening,
            read: async () => (await this._sensorStrategy(sensor).read(sensor))[0]?.value,
            write: port.write,
            current: () => config.openingPercent,
            settleMs: port.settleMs
        };
    }

    // un sensor enfant n'a pas sa propre commande : il est lu via la commande de son parent, limitée à son champ
    private async _resolveFeedbackSensor(sensorId: string): Promise<SensorModel> {
        const sensor = await this.sensorRepository.get(sensorId) as SensorModel;
        if (!sensor) {
            throw new Error(`RegulationService: sensor ${sensorId} introuvable`);
        }
        const parent = await this.sensorRepository.getParent(sensor);
        if (!parent) {
            return sensor;
        }
        // config de l'enfant prioritaire : field, et scaling pour un sensor ANALOG
        return { ...sensor, config: { ...(parent.config as ComSensorConfigModel), ...sensor.config } };
    }

    // sensor ANALOG : lecture COM convertie en grandeur physique ; sinon lecture COM brute
    private _sensorStrategy(sensor: SensorModel): SensorStrategy {
        return sensor.type === SensorType.ANALOG ? this.analogSensorStrategy : this.comSensorStrategy;
    }

}
