import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { find } from 'geo-tz';
import { DEFAULT_LANGUAGE, Language } from '@framework/i18n/language';
import { APP_VERSION } from '@framework/utils/app-version.util';
import { GlobalSettingsRepository } from '@process/infrastructure/repositories/global-settings.repository';
import { DEFAULT_MODE_RANKS, DEFAULT_TIME_ZONE, GlobalSettingsModel, LocalCoordinatesModel, ModeRanksModel } from '../models/global-settings.model';
import { ProcessMode } from '../interfaces/executable.interface';
import { ResolveCoordinates } from './sun-event.util';

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
    // fuseau IANA des crons et des calculs solaires, deduit des coordonnees (geo-tz) ; jamais vide
    // (UTC tant qu'aucune position n'est configuree)
    public timeZone: string = DEFAULT_TIME_ZONE;
    // emis quand localCoordinates ou timeZone changent : ScheduleService, TriggerService et
    // SensorService replanifient leurs jobs (pas de dependance directe : ils dependent deja de ce service)
    public readonly onLocationChanged = new Subject<void>();

    public constructor(private globalSettingsRepository: GlobalSettingsRepository) { }

    public async get(): Promise<GlobalSettingsModel> {
        const globalSettings = await this.globalSettingsRepository.get();
        return this._refreshCache(globalSettings);
    }

    public async update(entity: GlobalSettingsModel): Promise<GlobalSettingsModel> {
        const previous = { coordinates: ResolveCoordinates(this.localCoordinates), timeZone: this.timeZone };
        // fuseau persiste avec la position ; sans coordonnees il reste absent = non modifie
        if (entity.localCoordinates) {
            entity.timeZone = GlobalSettingsService._deduceTimeZone(entity.localCoordinates);
        }
        const saved = await this.globalSettingsRepository.update(entity);
        const refreshed = this._refreshCache(saved);
        const coordinates = ResolveCoordinates(this.localCoordinates);
        if (previous.timeZone !== this.timeZone
            || previous.coordinates.lat !== coordinates.lat || previous.coordinates.long !== coordinates.long) {
            this.onLocationChanged.next();
        }
        return refreshed;
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
        // timeZone renvoye brut (absent = pas encore configure) ; une box dont la position a ete
        // enregistree avant la deduction du fuseau le recalcule ici. Un fuseau invalide ferait
        // echouer les CronJob : on retombe alors sur UTC
        const timeZone = globalSettings.timeZone ?? GlobalSettingsService._deduceTimeZone(globalSettings.localCoordinates);
        this.timeZone = GlobalSettingsService._isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
        globalSettings.version = APP_VERSION;
        return globalSettings;
    }

    // geo-tz leve sur des coordonnees hors bornes ; en mer il renvoie un fuseau Etc/GMT±n
    private static _deduceTimeZone(coordinates?: LocalCoordinatesModel): string | undefined {
        if (!coordinates) { return undefined; }
        try {
            return find(coordinates.latitude, coordinates.longitude)[0];
        } catch {
            return undefined;
        }
    }

    private static _isValidTimeZone(timeZone?: string): boolean {
        if (!timeZone) { return false; }
        try {
            new Intl.DateTimeFormat('en-US', { timeZone });
            return true;
        } catch {
            return false;
        }
    }

}
