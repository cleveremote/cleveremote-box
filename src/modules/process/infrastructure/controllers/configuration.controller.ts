import { Controller } from '@nestjs/common';
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
import { CycleSynchronizeDTO, ScheduleSynchronizeDTO } from '../dto/synchronize.dto';

@Controller()
export class ConfigurationController {

    public constructor(
        private _configurationService: ConfigurationService,
        private _synchronizeService: SynchronizeService) {
    }

    @MessagePattern('synchronize/configuration')
    public async synchronise(@Payload() configurationSynchronizeDTO: ConfigurationSynchronizeDTO): Promise<StructureModel> {
        const uc = new ConfigurationSynchronizeUC(this._synchronizeService);
        const input = ConfigurationSynchronizeDTO.mapToNotificationModel(configurationSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('synchronize/configuration-partial')
    public async synchronisePartial(@Payload() cycleSynchronizeDTO: CycleSynchronizeDTO): Promise<CycleModel> {
        const uc = new ConfigurationPartialSynchronizeUC(this._synchronizeService);
        const input = CycleSynchronizeDTO.mapToCycleModel(cycleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('synchronize/schedule')
    public async synchroniseSchedule(@Payload() scheduleSynchronizeDTO: ScheduleSynchronizeDTO): Promise<CycleModel> {
        const uc = new ScheduleSynchronizeUC(this._synchronizeService);
        const input = ScheduleSynchronizeDTO.mapToScheduleModel(scheduleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('fetch/configuration')
    public async getConfiguration(): Promise<string> {
        const uc = new ConfigurationFetchUC(this._configurationService);
        const response = await uc.execute()
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }
}