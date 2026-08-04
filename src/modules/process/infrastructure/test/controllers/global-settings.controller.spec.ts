import { GlobalSettingsController } from '@process/infrastructure/controllers/global-settings.controller';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettingsSynchronizeDTO, LocalCoordinatesDTO } from '@process/infrastructure/dto/global-settings.dto';

describe('GlobalSettingsController', () => {
    let globalSettingsService: { get: jest.Mock; update: jest.Mock };
    let controller: GlobalSettingsController;

    beforeEach(() => {
        globalSettingsService = { get: jest.fn(), update: jest.fn() };
        controller = new GlobalSettingsController(globalSettingsService as unknown as GlobalSettingsService);
    });

    describe('synchronise', () => {
        it('should map the DTO and delegate persistence to GlobalSettingsService.update', async () => {
            const dto = new GlobalSettingsSynchronizeDTO();
            dto.localCoordinates = Object.assign(new LocalCoordinatesDTO(), { latitude: 34.1, longitude: -6.47 });
            const saved = Object.assign(new GlobalSettingsModel(), { id: 'settings-1', localCoordinates: { latitude: 34.1, longitude: -6.47 } });
            globalSettingsService.update.mockResolvedValue(saved);

            const result = await controller.synchronise(dto);

            expect(globalSettingsService.update).toHaveBeenCalledWith(
                expect.objectContaining({ localCoordinates: { latitude: 34.1, longitude: -6.47 } })
            );
            expect(result).toBe(saved);
        });
    });

    describe('getSettings', () => {
        it('should delegate to GlobalSettingsService.get', async () => {
            const model = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
            globalSettingsService.get.mockResolvedValue(model);

            const result = await controller.getSettings();

            expect(globalSettingsService.get).toHaveBeenCalled();
            expect(result).toBe(model);
        });
    });
});
