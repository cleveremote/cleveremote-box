import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CycleModel } from '@process/domain/models/cycle.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { ValuesFetchUC } from '@process/use-cases/values-fetch.uc';
import { CycleSynchronizeUC } from '@process/use-cases/cycle-synchronize.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ScheduleSynchronizeUC } from '@process/use-cases/schedule-synchronize.uc';
import { CycleSynchronizeDTO, ScheduleSynchronizeDTO, SensorSynchronizeDTO, StructureSynchronizeDTO, TriggerSynchronizeDTO } from '../dto/synchronize.dto';
import { TriggerSynchronizeUC } from '@process/use-cases/trigger-synchronize.uc';
import { SensorSynchronizeUC } from '@process/use-cases/sensor-synchronize.uc';
import { SensorModel } from '@process/domain/models/sensor.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { TriggerModel } from '@process/domain/models/trigger.model';

@Controller()
export class ConfigurationController {

    public constructor(
        private _configurationService: StructureService,
        private _synchronizeService: SynchronizeService) {
    }
    @UsePipes(ValidationPipe)
    @MessagePattern(['box/synchronize/configuration'])
    public async synchronise(@Payload() configurationSynchronizeDTO: StructureSynchronizeDTO): Promise<StructureModel> {
        const uc = new ConfigurationSynchronizeUC(this._synchronizeService);
        const input = StructureSynchronizeDTO.mapToStructureModel(configurationSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/cycle'])
    public async synchronisePartial(@Payload() cycleSynchronizeDTO: CycleSynchronizeDTO): Promise<CycleModel> {
        const uc = new CycleSynchronizeUC(this._synchronizeService);
        const input = CycleSynchronizeDTO.mapToCycleModel(cycleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/schedule'])
    public async synchroniseSchedule(@Payload() scheduleSynchronizeDTO: ScheduleSynchronizeDTO): Promise<ScheduleModel> {
        const uc = new ScheduleSynchronizeUC(this._synchronizeService);
        const input = ScheduleSynchronizeDTO.mapToScheduleModel(scheduleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/trigger'])
    public async synchroniseTrigger(@Payload() triggerSynchronizeDTO: TriggerSynchronizeDTO): Promise<TriggerModel> {
        const uc = new TriggerSynchronizeUC(this._synchronizeService);
        const input = TriggerSynchronizeDTO.mapToTriggerModel(triggerSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/sensor'])
    public async synchroniseSensor(@Payload() sensorSynchronizeDTO: SensorSynchronizeDTO): Promise<SensorModel> {
        const uc = new SensorSynchronizeUC(this._synchronizeService);
        const input = SensorSynchronizeDTO.mapToSensorModel(sensorSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/fetch/configuration'])
    public async getConfiguration(): Promise<string> {
        const uc = new ConfigurationFetchUC(this._configurationService);
        const response = await uc.execute()
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }

    @MessagePattern(['box/fetch/status'])
    public async getStatus(@Payload() data: any): Promise<string> {
        const uc = new ValuesFetchUC(this._configurationService);
        const response = await uc.execute(data.type, data.query)
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }
}