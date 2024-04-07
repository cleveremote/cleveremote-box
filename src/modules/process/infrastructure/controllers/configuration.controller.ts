import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CycleModel } from '@process/domain/models/cycle.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { ConfigurationPartialSynchronizeUC } from '@process/use-cases/configuration-partial-synchronize.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ScheduleSynchronizeUC } from '@process/use-cases/schedule-synchronize.uc';
import { ConfigurationSynchronizeDTO } from '../dto/configuration-synchronize.dto';
import { CycleSynchronizeDTO, ScheduleSynchronizeDTO, SensorSynchronizeDTO, TriggerSynchronizeDTO } from '../dto/synchronize.dto';
import { TriggerSynchronizeUC } from '@process/use-cases/trigger-synchronize.uc';
import { SensorSynchronizeUC } from '@process/use-cases/sensor-synchronize.uc';
import { SensorModel } from '@process/domain/models/sensor.model';

@Controller()
export class ConfigurationController {

    public constructor(
        private _configurationService: ConfigurationService,
        private _synchronizeService: SynchronizeService) {
    }
    @UsePipes(ValidationPipe)
    @MessagePattern('box/synchronize/configuration')
    public async synchronise(@Payload() configurationSynchronizeDTO: ConfigurationSynchronizeDTO): Promise<StructureModel> {
        const uc = new ConfigurationSynchronizeUC(this._synchronizeService);
        const input = ConfigurationSynchronizeDTO.mapToNotificationModel(configurationSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('box/synchronize/configuration-partial')
    public async synchronisePartial(@Payload() cycleSynchronizeDTO: CycleSynchronizeDTO): Promise<CycleModel> {
        const uc = new ConfigurationPartialSynchronizeUC(this._synchronizeService);
        const input = CycleSynchronizeDTO.mapToCycleModel(cycleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('box/synchronize/schedule')
    public async synchroniseSchedule(@Payload() scheduleSynchronizeDTO: ScheduleSynchronizeDTO): Promise<CycleModel> {
        console.log('scheduleSynchronizeDTO',scheduleSynchronizeDTO);
        const uc = new ScheduleSynchronizeUC(this._synchronizeService);
        const input = ScheduleSynchronizeDTO.mapToScheduleModel(scheduleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('box/synchronize/trigger')
    public async synchroniseTrigger(@Payload() triggerSynchronizeDTO: TriggerSynchronizeDTO): Promise<CycleModel> {
        console.log('triggerSynchronizeDTO',triggerSynchronizeDTO);
        const uc = new TriggerSynchronizeUC(this._synchronizeService);
        const input = TriggerSynchronizeDTO.mapToTriggerModel(triggerSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('box/synchronize/sensor')
    public async synchroniseSensor(@Payload() sensorSynchronizeDTO: SensorSynchronizeDTO): Promise<SensorModel> {
        console.log('sensorSynchronizeDTO',sensorSynchronizeDTO);
        const uc = new SensorSynchronizeUC(this._synchronizeService);
        const input = SensorSynchronizeDTO.mapToSensorModel(sensorSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('box/fetch/configuration')
    public async getConfiguration(): Promise<string> {
        const uc = new ConfigurationFetchUC(this._configurationService);
        const response = await uc.execute()
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }
}