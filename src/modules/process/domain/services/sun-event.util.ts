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

export function ComputeSunEventDate(sunBehavior: SunBehavior, referenceDate: Date, coordinates: { lat: number; long: number }): Date {
    const base = sunBehavior.sunState === SunState.SUNRISE
        ? getSunrise(coordinates.lat, coordinates.long, referenceDate)
        : getSunset(coordinates.lat, coordinates.long, referenceDate);
    const signedOffset = sunBehavior.timeDirection === TimeDirection.AFTER ? sunBehavior.time : -sunBehavior.time;
    return new Date(base.getTime() + signedOffset);
}
