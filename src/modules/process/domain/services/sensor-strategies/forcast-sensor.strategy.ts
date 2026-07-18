import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SensorType } from '../../interfaces/sensor.interface';
import { ForcastSensorConfigModel, SensorModel } from '../../models/sensor.model';
import { ReadResult, SensorStrategy } from './sensor-strategy.interface';

// coordonnees fixes de la box (pas de configuration multi-site pour l'instant)
const COORD = { lat: 34.100780850096896, lon: -6.4666017095313935 };

@Injectable()
export class ForcastSensorStrategy implements SensorStrategy {
    public readonly type = SensorType.FORCAST;

    public constructor(private readonly httpService: HttpService) { }

    public async read(sensor: SensorModel): Promise<ReadResult> {
        const { forcastData } = sensor.config as ForcastSensorConfigModel;
        const response = await firstValueFrom(this.httpService.get('https://api.open-meteo.com/v1/forecast', {
            params: {
                latitude: COORD.lat,
                longitude: COORD.lon,
                daily: 'temperature_2m_max,temperature_2m_min',
                timezone: 'auto'
            }
        }));
        // index 1 : prevision du lendemain (index 0 = aujourd'hui)
        const value = Number(response.data.daily[forcastData][1]);
        return [{ value, isFormated: true, unit: '°C', name: sensor.name }];
    }
}
