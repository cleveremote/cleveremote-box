import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ComActuatorConfigModel, ActuatorModel } from '../../models/actuator.model';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { ModbusTaskService } from '../modbus-task.service';
import { ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';

@Injectable()
export class ComActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.COM;

    public constructor(
        // private configurationService: StructureService,
        // private authenticationService: AuthenticationService,
        // private dbService: DbService,
        // private processService: ProcessService,
        // private scheduleService: ScheduleService,
        // private triggerService: TriggerService,
        // private sensorService: SensorService,
        // private bleService: BleService,
        private modBusService: ModbusTaskService,
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
        // await this.modBusService.testExecuteTask({
        //     _id: 'io8ch-do4-off',
        //     deviceId: deviceId,
        //     name: 'IO 8CH - DO4 OFF',
        //     config: {
        //         function: ModbusFunctionName[comRequestData.config.function],
        //         address: comRequestData.config.address,
        //         params: {}
        //     }
        // }, { value: 0 });
        await this.modBusService.execute(comRequestData._id, { value: action, adress: actions[0].digitalPort});
        //throw new NotImplementedError(`ComActuatorStrategy.execute is not implemented yet (deviceId: ${deviceId})`);
    }

    public read(actuator: ActuatorModel): number {
        const { deviceId } = actuator.config as ComActuatorConfigModel;
        throw new NotImplementedError(`ComActuatorStrategy.read is not implemented yet (deviceId: ${deviceId})`);
    }

}
