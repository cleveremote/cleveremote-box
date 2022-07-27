import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { StructureModel } from '@process/domain/models/structure.model';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ConfigurationSynchronizeDTO } from '../dto/configuration-synchronize.dto';
import { CycleSynchronizeDTO } from '../dto/synchronize.dto';

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
    public async synchronisePartial(@Payload() cycleSynchronizeDTO: CycleSynchronizeDTO): Promise<StructureModel> {
        const uc = new ConfigurationPartialSynchronizeUC(this._synchronizeService);
        const input = ConfigurationSynchronizeDTO.mapToNotificationModel(configurationSynchronizeDTO);
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