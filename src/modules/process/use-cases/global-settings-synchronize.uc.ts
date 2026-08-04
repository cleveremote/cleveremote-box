import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';

export class GlobalSettingsSynchronizeUC {
    public constructor(private globalSettingsService: GlobalSettingsService) { }

    public execute(globalSettingsModel: GlobalSettingsModel): Promise<GlobalSettingsModel> {
        return this.globalSettingsService.update(globalSettingsModel);
    }
}
