import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ComActuatorConfigModel, ActuatorModel } from '../../models/actuator.model';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { ModbusService } from '../modbus.service';
import { ComRequestConfigModel, ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';

@Injectable()
export class ComActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.COM;

    public constructor(
        // private configurationService: StructureService,
        // private authenticationService: AuthenticationService,
        // private processService: ProcessService,
        // private scheduleService: ScheduleService,
        // private triggerService: TriggerService,
        // private sensorService: SensorService,
        // private bleService: BleService,
        private modbusService: ModbusService,
        private comRequestRepository: ComRequestRepository,
        // private readonly logger: Logger,
        // private readonly _processService: ProcessService
    ) { }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async configure(actuator: ActuatorModel): Promise<void> {
        // rien a configurer cote box : l'actionneur COM est pilote par un module distant
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async execute(actuator: ActuatorModel, action: number): Promise<void> {
        const { deviceId, actions } = actuator.config as ComActuatorConfigModel;
        const comRequestData: ComRequestModel = await this.comRequestRepository.get(actions[0].comRequestId) as ComRequestModel;
        const overrideParams: ComRequestConfigModel = {address: actions[0].portNumber,params: {value: action} }
        this.modbusService.execute(comRequestData, this.buidOverrideParams(comRequestData.config, overrideParams));
        
    }

    public read(actuator: ActuatorModel): number {
        const { deviceId } = actuator.config as ComActuatorConfigModel;
        throw new NotImplementedError(`ComActuatorStrategy.read is not implemented yet (deviceId: ${deviceId})`);
    }

    private buidOverrideParams(params: ComRequestConfigModel, overrideParams: ComRequestConfigModel): ComRequestConfigModel {
        const overridedParams: ComRequestConfigModel = {
            address: overrideParams.address || params.address,
            function: overrideParams.function || params.function,
            disabled: overrideParams.disabled || params.disabled,
            params: {
                length: overrideParams.params?.length || params.params?.length,
                scale: overrideParams.params?.scale || params.params?.scale,
                unit: overrideParams.params?.unit || params.params?.unit,
                value: overrideParams.params?.value || params.params?.value,
                persistence: {
                    persist: overrideParams.params?.persistence?.persist ?? params.params?.persistence?.persist ?? false,
                    address: overrideParams.params?.persistence?.address ?? params.params?.persistence?.address ?? 0
                }
            }
        }; 
        return overridedParams;
    }

}
