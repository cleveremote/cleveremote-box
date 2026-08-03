import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { GlobalSettingsSynchronizeUC } from '@process/use-cases/global-settings-synchronize.uc';
import { GlobalSettingsFetchUC } from '@process/use-cases/global-settings-fetch.uc';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettingsSynchronizeDTO } from '../dto/global-settings.dto';

@Controller()
@UsePipes(new ValidationPipe({ transform: true }))
export class GlobalSettingsController {

    public constructor(
        private _globalSettingsService: GlobalSettingsService) {
    }

    @MessagePattern(['box/synchronize/settings'])
    public async synchronise(@Payload() globalSettingsSynchronizeDTO: GlobalSettingsSynchronizeDTO): Promise<GlobalSettingsModel> {
        const uc = new GlobalSettingsSynchronizeUC(this._globalSettingsService);
        const input = GlobalSettingsSynchronizeDTO.mapToGlobalSettingsModel(globalSettingsSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/fetch/settings'])
    public async getSettings(): Promise<GlobalSettingsModel> {
        const uc = new GlobalSettingsFetchUC(this._globalSettingsService);
        return uc.execute();
    }
}
