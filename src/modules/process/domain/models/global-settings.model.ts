import { Language } from '@framework/i18n/language';
import { ProcessMode, RankedProcessMode } from '../interfaces/executable.interface';

export class LocalCoordinatesModel {
    public latitude: number;
    public longitude: number;
}

// rang de chaque origine lors de l'arbitrage d'un conflit d'actuator : le plus petit rang passe
// en premier, a rang egal le front doit confirmer.
export type ModeRanksModel = Record<RankedProcessMode, number>;

export const DEFAULT_MODE_RANKS: ModeRanksModel = {
    [ProcessMode.MANUAL]: 0,
    [ProcessMode.SCHEDULE]: 1,
    [ProcessMode.TRIGGER]: 2
};

// fuseau utilise tant que la box n'a pas recu le sien (cf. GlobalSettingsService.timeZone)
export const DEFAULT_TIME_ZONE = 'UTC';

export class GlobalSettingsModel {
    public id: string;
    public localCoordinates: LocalCoordinatesModel;
    public modeRanks?: ModeRanksModel;
    // langue par defaut des textes de la box (register maps traduites, noms generes)
    public language?: Language;
    // identifiant IANA (ex. Africa/Casablanca) deduit de localCoordinates (geo-tz) : fuseau des crons (schedules, sensors) et du jour
    // calendaire des calculs solaires. Les dates echangees avec l'app restent des instants UTC.
    public timeZone?: string;
    public version?: string;
}
