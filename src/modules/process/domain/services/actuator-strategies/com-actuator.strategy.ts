import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ComActuatorConfigModel, ActuatorModel } from '../../models/actuator.model';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { ModbusService } from '../modbus.service';
import { ComRequestConfigModel, ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { buildOverrideParams } from '@process/domain/utils/build-override-params.util';

@Injectable()
export class ComActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.COM;

    public constructor(
        private modbusService: ModbusService,
        private comRequestRepository: ComRequestRepository
    ) { }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async configure(actuator: ActuatorModel): Promise<void> {
        // rien a configurer cote box : l'actionneur COM est pilote par un module distant
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async execute(actuator: ActuatorModel, action: number): Promise<void> {
        const { actions } = actuator.config as ComActuatorConfigModel;
        const comRequestData: ComRequestModel = await this.comRequestRepository.get(actions[0].comRequestId) as ComRequestModel;
        const overrideParams: ComRequestConfigModel = {address: actions[0].portNumber,params: {value: action} };
        this.modbusService.execute(comRequestData,buildOverrideParams(comRequestData.config, overrideParams));
        
    }

    public read(actuator: ActuatorModel): number {
        const { deviceId } = actuator.config as ComActuatorConfigModel;
        throw new NotImplementedError(`ComActuatorStrategy.read is not implemented yet (deviceId: ${deviceId})`);
    }

}
