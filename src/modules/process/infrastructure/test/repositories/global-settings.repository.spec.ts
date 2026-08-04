import { Model } from 'mongoose';
import { GlobalSettingsRepository } from '@process/infrastructure/repositories/global-settings.repository';
import { GlobalSettingsDocument } from '@process/infrastructure/schemas/global-settings.schema';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';

describe('GlobalSettingsRepository', () => {
    let globalSettingsModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
    let repository: GlobalSettingsRepository;

    beforeEach(() => {
        globalSettingsModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
        repository = new GlobalSettingsRepository(globalSettingsModel as never as Model<GlobalSettingsDocument>);
    });

    describe('get', () => {
        it('should map and return the found global settings document', async () => {
            globalSettingsModel.findOne.mockResolvedValue({
                _id: 'settings-1',
                localCoordinates: { latitude: 34.1, longitude: -6.47 }
            });

            const result = await repository.get();

            expect(globalSettingsModel.findOne).toHaveBeenCalled();
            expect(result).toEqual(Object.assign(new GlobalSettingsModel(), {
                id: 'settings-1',
                localCoordinates: { latitude: 34.1, longitude: -6.47 }
            }));
        });

        it('should return a fresh GlobalSettingsModel when none exists', async () => {
            globalSettingsModel.findOne.mockResolvedValue(null);

            const result = await repository.get();

            expect(result).toEqual(new GlobalSettingsModel());
        });
    });

    describe('update', () => {
        it('should upsert the single global settings document and return the mapped result', async () => {
            const entity = Object.assign(new GlobalSettingsModel(), {
                localCoordinates: { latitude: 34.1, longitude: -6.47 }
            });
            globalSettingsModel.findOneAndUpdate.mockResolvedValue({
                _id: 'settings-1',
                localCoordinates: { latitude: 34.1, longitude: -6.47 }
            });

            const result = await repository.update(entity);

            expect(globalSettingsModel.findOneAndUpdate).toHaveBeenCalledWith(
                {},
                expect.objectContaining({ localCoordinates: { latitude: 34.1, longitude: -6.47 } }),
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            expect(result).toEqual(Object.assign(new GlobalSettingsModel(), {
                id: 'settings-1',
                localCoordinates: { latitude: 34.1, longitude: -6.47 }
            }));
        });
    });
});
