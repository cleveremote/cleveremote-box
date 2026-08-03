import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettings, GlobalSettingsDocument } from '../global-settings.schema';

export class GlobalSettingsMapper {

    public static mapToModel(globalSettings: GlobalSettingsDocument): GlobalSettingsModel {
        const model = new GlobalSettingsModel();
        model.id = globalSettings._id;
        model.localCoordinates = globalSettings.localCoordinates;
        return model;
    }

    public static mapToSchema(model: GlobalSettingsModel): GlobalSettings {
        const globalSettings = new GlobalSettings();
        globalSettings.localCoordinates = model.localCoordinates;
        return globalSettings;
    }

}
