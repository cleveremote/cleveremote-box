import { Injectable } from '@nestjs/common';
import { GlobalSettingsRepository } from '@process/infrastructure/repositories/global-settings.repository';
import { GlobalSettingsModel, LocalCoordinatesModel } from '../models/global-settings.model';

@Injectable()
export class GlobalSettingsService {

    // cache memoire tenu a jour a chaque lecture/ecriture, consulte de facon synchrone par les
    // calculs solaires (ComputeSunEventDate) et ForcastSensorStrategy : voir ResolveCoordinates
    // dans sun-event.util.ts pour le fallback quand aucune position n'est encore configuree.
    public localCoordinates: LocalCoordinatesModel;

    public constructor(private globalSettingsRepository: GlobalSettingsRepository) { }

    public async get(): Promise<GlobalSettingsModel> {
        const globalSettings = await this.globalSettingsRepository.get();
        this.localCoordinates = globalSettings.localCoordinates;
        return globalSettings;
    }

    public async update(entity: GlobalSettingsModel): Promise<GlobalSettingsModel> {
        const saved = await this.globalSettingsRepository.update(entity);
        this.localCoordinates = saved.localCoordinates;
        return saved;
    }

}
