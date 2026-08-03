import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';

describe('GlobalSettingsService', () => {
    let globalSettingsRepository: { get: jest.Mock; update: jest.Mock };
    let service: GlobalSettingsService;

    beforeEach(() => {
        globalSettingsRepository = { get: jest.fn(), update: jest.fn() };
        service = new GlobalSettingsService(globalSettingsRepository as never);
    });

    describe('get', () => {
        it('should delegate to the repository', async () => {
            const model = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
            globalSettingsRepository.get.mockResolvedValue(model);

            const result = await service.get();

            expect(globalSettingsRepository.get).toHaveBeenCalled();
            expect(result).toBe(model);
        });

        it('should cache the fetched coordinates on the service instance', async () => {
            const model = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
            globalSettingsRepository.get.mockResolvedValue(model);

            await service.get();

            expect(service.localCoordinates).toEqual({ latitude: 34.1, longitude: -6.47 });
        });
    });

    describe('update', () => {
        it('should delegate to the repository', async () => {
            const entity = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
            globalSettingsRepository.update.mockResolvedValue(entity);

            const result = await service.update(entity);

            expect(globalSettingsRepository.update).toHaveBeenCalledWith(entity);
            expect(result).toBe(entity);
        });

        it('should refresh the cached coordinates from the saved entity, not the input entity', async () => {
            const input = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 1, longitude: 2 } });
            const saved = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
            globalSettingsRepository.update.mockResolvedValue(saved);

            await service.update(input);

            expect(service.localCoordinates).toEqual({ latitude: 34.1, longitude: -6.47 });
        });
    });
});
