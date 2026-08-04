import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';

export class GlobalSettingsFetchUC {
    public constructor(private globalSettingsService: GlobalSettingsService) { }

    public execute(): Promise<GlobalSettingsModel> {
        return this.globalSettingsService.get();
    }
}
