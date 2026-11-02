import { Injectable } from '@nestjs/common';
import { DEFAULT_LANGUAGE, Language } from '@framework/i18n/language';
import { APP_VERSION } from '@framework/utils/app-version.util';
import { GlobalSettingsRepository } from '@process/infrastructure/repositories/global-settings.repository';
import { DEFAULT_MODE_RANKS, GlobalSettingsModel, LocalCoordinatesModel, ModeRanksModel } from '../models/global-settings.model';
import { ProcessMode } from '../interfaces/executable.interface';

@Injectable()
export class GlobalSettingsService {

    // cache memoire tenu a jour a chaque lecture/ecriture, consulte de facon synchrone par les
    // calculs solaires (ComputeSunEventDate) et ForcastSensorStrategy : voir ResolveCoordinates
    // dans sun-event.util.ts pour le fallback quand aucune position n'est encore configuree.
    public localCoordinates: LocalCoordinatesModel;
    // meme principe, consulte par l'arbitrage des conflits (ProcessService) ; jamais vide
    public modeRanks: ModeRanksModel = { ...DEFAULT_MODE_RANKS };
    // langue par defaut des register maps et des noms generes ; jamais vide
    public language: Language = DEFAULT_LANGUAGE;

    public constructor(private globalSettingsRepository: GlobalSettingsRepository) { }

    public async get(): Promise<GlobalSettingsModel> {
        const globalSettings = await this.globalSettingsRepository.get();
        return this._refreshCache(globalSettings);
    }

    public async update(entity: GlobalSettingsModel): Promise<GlobalSettingsModel> {
        const saved = await this.globalSettingsRepository.update(entity);
        return this._refreshCache(saved);
    }

    // rang d'une origine : le plus petit passe en premier ; SYSTEM (sans rang) perd toujours
    public rankOf(mode: ProcessMode): number {
        return this.modeRanks[mode] ?? Number.POSITIVE_INFINITY;
    }

    // renvoie au front les rangs effectifs (defauts compris) pour qu'il les affiche
    private _refreshCache(globalSettings: GlobalSettingsModel): GlobalSettingsModel {
        this.localCoordinates = globalSettings.localCoordinates;
        this.modeRanks = { ...DEFAULT_MODE_RANKS, ...globalSettings.modeRanks };
        globalSettings.modeRanks = this.modeRanks;
        this.language = globalSettings.language ?? DEFAULT_LANGUAGE;
        globalSettings.language = this.language;
        globalSettings.version = APP_VERSION;
        return globalSettings;
    }

}
