import { MockClass } from '@framework/utils/test.utils';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { GlobalSettingsSynchronizeUC } from './global-settings-synchronize.uc';

describe('Process use case test', () => {
    it('Should persist the given global settings and return the saved result', async () => {
        // GIVEN
        const globalSettingsService = MockClass(GlobalSettingsService);
        const input = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
        const saved = Object.assign(new GlobalSettingsModel(), { id: 'settings-1', localCoordinates: { latitude: 34.1, longitude: -6.47 } });
        jest.spyOn(globalSettingsService, 'update').mockResolvedValue(saved);

        // WHEN
        const uc = new GlobalSettingsSynchronizeUC(globalSettingsService);
        const result = await uc.execute(input);

        // THEN
        expect(globalSettingsService.update).toHaveBeenLastCalledWith(input);
        expect(globalSettingsService.update).toHaveBeenCalledTimes(1);
        expect(result).toBe(saved);
    });
});
