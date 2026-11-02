import { Language } from '@framework/i18n/language';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettings, GlobalSettingsDocument } from '../global-settings.schema';

export class GlobalSettingsMapper {

    public static mapToModel(globalSettings: GlobalSettingsDocument): GlobalSettingsModel {
        const model = new GlobalSettingsModel();
        model.id = globalSettings._id;
        model.localCoordinates = globalSettings.localCoordinates;
        model.modeRanks = globalSettings.modeRanks
            ? { MANUAL: globalSettings.modeRanks.MANUAL, SCHEDULE: globalSettings.modeRanks.SCHEDULE, TRIGGER: globalSettings.modeRanks.TRIGGER }
            : undefined;
        model.language = globalSettings.language as Language;
        return model;
    }

    public static mapToSchema(model: GlobalSettingsModel): GlobalSettings {
        const globalSettings = new GlobalSettings();
        // champ absent = non modifie (mongoose ignore les cles undefined dans un update)
        globalSettings.localCoordinates = model.localCoordinates;
        globalSettings.modeRanks = model.modeRanks;
        globalSettings.language = model.language;
        return globalSettings;
    }

}
