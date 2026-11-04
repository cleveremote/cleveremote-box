import { getSunrise, getSunset } from 'sunrise-sunset-js';
import { SunState, TimeDirection } from '../interfaces/schedule.interface';
import { SunBehavior } from '@process/infrastructure/dto/synchronize.dto';
import { LocalCoordinatesModel } from '../models/global-settings.model';

// coordonnees par defaut utilisees tant qu'aucune position n'a ete configuree via l'app mobile
// (BLE, cf. BleService.buildContenteConfigFile) ou pas encore chargee en cache au demarrage
// (cf. GlobalSettingsService.localCoordinates)
export const DEFAULT_COORD = { lat: 34.100780850096896, long: -6.4666017095313935 };

export function ResolveCoordinates(localCoordinates?: LocalCoordinatesModel): { lat: number; long: number } {
    return localCoordinates
        ? { lat: localCoordinates.latitude, long: localCoordinates.longitude }
        : DEFAULT_COORD;
}

// sunrise-sunset-js lit le jour calendaire dans le fuseau du process (getFullYear/getMonth/getDate) :
// on lui passe midi (heure process) du jour courant de la box, sinon le driver qui tique a 00:00
// heure box pourrait calculer le lever/coucher de la veille quand les deux fuseaux different.
function BoxCalendarDay(referenceDate: Date, timeZone: string): Date {
    const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(referenceDate)
        .split('-')
        .map(Number);
    return new Date(year, month - 1, day, 12);
}

export function ComputeSunEventDate(sunBehavior: SunBehavior, referenceDate: Date, coordinates: { lat: number; long: number },
    timeZone: string): Date {
    const day = BoxCalendarDay(referenceDate, timeZone);
    const base = sunBehavior.sunState === SunState.SUNRISE
        ? getSunrise(coordinates.lat, coordinates.long, day)
        : getSunset(coordinates.lat, coordinates.long, day);
    const signedOffset = sunBehavior.timeDirection === TimeDirection.AFTER ? sunBehavior.time : -sunBehavior.time;
    return new Date(base.getTime() + signedOffset);
}
