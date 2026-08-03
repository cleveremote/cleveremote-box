import { MockClass } from '@framework/utils/test.utils';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { GlobalSettingsFetchUC } from './global-settings-fetch.uc';

describe('Process use case test', () => {
    it('Should fetch global settings and return them', async () => {
        // GIVEN
        const globalSettingsService = MockClass(GlobalSettingsService);
        const globalSettingsModel = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
        jest.spyOn(globalSettingsService, 'get').mockResolvedValue(globalSettingsModel);

        // WHEN
        const uc = new GlobalSettingsFetchUC(globalSettingsService);
        const result = await uc.execute();

        // THEN
        expect(globalSettingsService.get).toHaveBeenCalledTimes(1);
        expect(result).toBe(globalSettingsModel);
    });
});
