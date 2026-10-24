import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ComActuatorConfigModel, ActuatorModel } from '../../models/actuator.model';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { ModbusService } from '../modbus.service';
import { ComRequestConfigModel, ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { buildOverrideParams } from '@process/domain/utils/build-override-params.util';
import { DeviceCommandService } from '../device-command.service';

@Injectable()
export class ComActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.COM;

    public constructor(
        private modbusService: ModbusService,
        private comRequestRepository: ComRequestRepository,
        private deviceCommandService: DeviceCommandService
    ) { }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async configure(actuator: ActuatorModel): Promise<void> {
        // rien a configurer cote box : l'actionneur COM est pilote par un module distant
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async execute(actuator: ActuatorModel, action: number): Promise<void> {
        const { actions } = actuator.config as ComActuatorConfigModel;
        if (actions[0].commandId) {
            // register map : `action` est la valeur saisie de l'opération (ex: outputs.set 0/1), validée par le template.
            // Erreur Modbus/réseau : loggée par RegisterMapService, non levée (même comportement que le chemin ComRequest)
            await this.deviceCommandService.execute(actions[0].commandId, { channel: actions[0].channel, value: action });
            return;
        }
        const comRequestData: ComRequestModel = await this.comRequestRepository.get(actions[0].comRequestId) as ComRequestModel;
        const overrideParams: ComRequestConfigModel = { address: actions[0].portNumber, params: { value: action } };
        this.modbusService.execute(comRequestData, buildOverrideParams(comRequestData.config, overrideParams));

    }

    public read(actuator: ActuatorModel): number {
        const { deviceId } = actuator.config as ComActuatorConfigModel;
        throw new NotImplementedError(`ComActuatorStrategy.read is not implemented yet (deviceId: ${deviceId})`);
    }

}
