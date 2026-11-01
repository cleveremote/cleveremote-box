import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { DEFAULT_MODE_RANKS, GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { ProcessMode } from '@process/domain/interfaces/executable.interface';
import { APP_VERSION } from '@framework/utils/app-version.util';

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
            expect(result.version).toBe(APP_VERSION);
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
            expect(result.version).toBe(APP_VERSION);
        });

        it('should refresh the cached coordinates from the saved entity, not the input entity', async () => {
            const input = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 1, longitude: 2 } });
            const saved = Object.assign(new GlobalSettingsModel(), { localCoordinates: { latitude: 34.1, longitude: -6.47 } });
            globalSettingsRepository.update.mockResolvedValue(saved);

            await service.update(input);

            expect(service.localCoordinates).toEqual({ latitude: 34.1, longitude: -6.47 });
        });
    });

    describe('modeRanks', () => {
        it('should rank with the defaults until settings are loaded', () => {
            expect(service.rankOf(ProcessMode.MANUAL)).toBe(0);
            expect(service.rankOf(ProcessMode.SCHEDULED)).toBe(1);
            expect(service.rankOf(ProcessMode.TRIGGER)).toBe(2);
        });

        it('should rank SYSTEM (or a missing mode) last', () => {
            expect(service.rankOf(ProcessMode.SYSTEM)).toBe(Number.POSITIVE_INFINITY);
            expect(service.rankOf(undefined)).toBe(Number.POSITIVE_INFINITY);
        });

        it('should return and cache the stored ranks', async () => {
            const ranks = { MANUAL: 2, SCHEDULE: 0, TRIGGER: 1 };
            globalSettingsRepository.get.mockResolvedValue(Object.assign(new GlobalSettingsModel(), { modeRanks: ranks }));

            const result = await service.get();

            expect(result.modeRanks).toEqual(ranks);
            expect(service.rankOf(ProcessMode.SCHEDULED)).toBe(0);
        });

        it('should fill the defaults when nothing is stored', async () => {
            globalSettingsRepository.get.mockResolvedValue(new GlobalSettingsModel());

            const result = await service.get();

            expect(result.modeRanks).toEqual(DEFAULT_MODE_RANKS);
        });
    });
});
