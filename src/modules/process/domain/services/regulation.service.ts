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
import { ComSensorStrategy } from './sensor-strategies/com-sensor.strategy';

// pilotage de l'actionneur fourni par sa stratégie (CtrlActuatorStrategy) : évite toute dépendance inverse
export type ActuatorPort = Pick<ControlPlant, 'write' | 'settleMs'>;

// Adaptateur process <-> control : expose un actionneur CTRL et le sensor de retour d'une ControlLoop
// sous forme de ControlPlant, puis délègue la régulation au module control.
@Injectable()
export class RegulationService {

    public constructor(
        private readonly logger: Logger,
        private controlLoopRepository: ControlLoopRepository,
        private sensorRepository: SensorRepository,
        private comSensorStrategy: ComSensorStrategy,
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

    private _plant(actuator: ActuatorModel, sensor: SensorModel, port: ActuatorPort): ControlPlant {
        const config = actuator.config as CtrlActuatorConfigModel;
        return {
            min: config.minOpening,
            max: config.maxOpening,
            read: async () => (await this.comSensorStrategy.read(sensor))[0]?.value,
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
        const { field } = sensor.config as ComSensorConfigModel;
        return { ...sensor, config: { ...(parent.config as ComSensorConfigModel), field } };
    }

}
