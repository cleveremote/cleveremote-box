import { UsePipes, ValidationPipe } from '@nestjs/common';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { WsJwtAuth } from '../../../../common/auth/ws-jwt-auth.decorator';
import { StructureModel } from '@process/domain/models/structure.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ModbusConnectionConfigModel } from '@process/domain/models/modbusConnectionConfig.model';
import { ModbusTaskConfigModel } from '@process/domain/models/modbusTaskConfig.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { ValuesFetchUC } from '@process/use-cases/values-fetch.uc';
import { CycleSynchronizeUC } from '@process/use-cases/cycle-synchronize.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ScheduleSynchronizeUC } from '@process/use-cases/schedule-synchronize.uc';
import { TriggerSynchronizeUC } from '@process/use-cases/trigger-synchronize.uc';
import { SensorSynchronizeUC } from '@process/use-cases/sensor-synchronize.uc';
import { ModbusConnectionSynchronizeUC } from '@process/use-cases/modbusconnection-synchronize.uc';
import { ModbusTaskSynchronizeUC } from '@process/use-cases/modbustask-synchronize.uc';
import {
    CycleSynchronizeDTO,
    ModbusConnectionConfigDTO,
    ModbusTaskConfigDTO,
    ScheduleSynchronizeDTO,
    SensorSynchronizeDTO,
    StructureSynchronizeDTO,
    TriggerSynchronizeDTO,
} from '../dto/synchronize.dto';

@WebSocketGateway({ cors: { origin: '*' } })
export class ConfigurationGateway {

    public constructor(
        private _configurationService: StructureService,
        private _synchronizeService: SynchronizeService) {
    }

    @WsJwtAuth()
    @UsePipes(ValidationPipe)
    @SubscribeMessage('box/synchronize/configuration')
    public async synchronise(@MessageBody() configurationSynchronizeDTO: StructureSynchronizeDTO): Promise<StructureModel> {
        const uc = new ConfigurationSynchronizeUC(this._synchronizeService);
        const input = StructureSynchronizeDTO.mapToStructureModel(configurationSynchronizeDTO);
        return uc.execute(input);
    }

    @WsJwtAuth()
    @SubscribeMessage('box/synchronize/modbusconnection')
    public async synchroniseModbusConnection(@MessageBody() modbusConnectionConfigDTO: ModbusConnectionConfigDTO): Promise<ModbusConnectionConfigModel> {
        const uc = new ModbusConnectionSynchronizeUC(this._synchronizeService);
        const input = ModbusConnectionConfigDTO.mapToModbusConnectionConfigModel(modbusConnectionConfigDTO);
        return uc.execute(input);
    }

    @WsJwtAuth()
    @SubscribeMessage('box/synchronize/modbustask')
    public async synchronisePModbusTask(@MessageBody() modbusTaskConfigDTO: ModbusTaskConfigDTO): Promise<ModbusTaskConfigModel> {
        const uc = new ModbusTaskSynchronizeUC(this._synchronizeService);
        const input = ModbusTaskConfigDTO.mapToModbusTaskConfigModel(modbusTaskConfigDTO);
        return uc.execute(input);
    }

    @WsJwtAuth()
    @SubscribeMessage('box/synchronize/cycle')
    public async synchronisePartial(@MessageBody() cycleSynchronizeDTO: CycleSynchronizeDTO): Promise<CycleModel> {
        const uc = new CycleSynchronizeUC(this._synchronizeService);
        const input = CycleSynchronizeDTO.mapToCycleModel(cycleSynchronizeDTO);
        return uc.execute(input);
    }

    @WsJwtAuth()
    @SubscribeMessage('box/synchronize/schedule')
    public async synchroniseSchedule(@MessageBody() scheduleSynchronizeDTO: ScheduleSynchronizeDTO): Promise<ScheduleModel> {
        const uc = new ScheduleSynchronizeUC(this._synchronizeService);
        const input = ScheduleSynchronizeDTO.mapToScheduleModel(scheduleSynchronizeDTO);
        return uc.execute(input);
    }

    @WsJwtAuth()
    @SubscribeMessage('box/synchronize/trigger')
    public async synchroniseTrigger(@MessageBody() triggerSynchronizeDTO: TriggerSynchronizeDTO): Promise<TriggerModel> {
        const uc = new TriggerSynchronizeUC(this._synchronizeService);
        const input = TriggerSynchronizeDTO.mapToTriggerModel(triggerSynchronizeDTO);
        return uc.execute(input);
    }

    @WsJwtAuth()
    @SubscribeMessage('box/synchronize/sensor')
    public async synchroniseSensor(@MessageBody() sensorSynchronizeDTO: SensorSynchronizeDTO): Promise<SensorModel> {
        const uc = new SensorSynchronizeUC(this._synchronizeService);
        const input = SensorSynchronizeDTO.mapToSensorModel(sensorSynchronizeDTO);
        return uc.execute(input);
    }

    @WsJwtAuth()
    @SubscribeMessage('box/fetch/configuration')
    public async getConfiguration(): Promise<string> {
        const uc = new ConfigurationFetchUC(this._configurationService);
        const response = await uc.execute();
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }

    @WsJwtAuth()
    @SubscribeMessage('box/fetch/plan')
    public async getPlan(): Promise<string> {
        return `svg`;
    }

    @WsJwtAuth()
    @SubscribeMessage('box/fetch/status')
    public async getStatus(@MessageBody() data: any): Promise<string> {
        const uc = new ValuesFetchUC(this._configurationService);
        const response = await uc.execute(data.type, data.query);
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }
}
