import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SensorType } from '../../interfaces/sensor.interface';
import { ForcastSensorConfigModel, SensorModel } from '../../models/sensor.model';
import { ReadResult, SensorStrategy } from './sensor-strategy.interface';
import { GlobalSettingsService } from '../global-settings.service';
import { ResolveCoordinates } from '../sun-event.util';

@Injectable()
export class ForcastSensorStrategy implements SensorStrategy {
    public readonly type = SensorType.FORCAST;

    public constructor(
        private readonly httpService: HttpService,
        private readonly globalSettingsService: GlobalSettingsService
    ) { }

    public async read(sensor: SensorModel): Promise<ReadResult> {
        const { forcastData } = sensor.config as ForcastSensorConfigModel;
        const { lat, long } = ResolveCoordinates(this.globalSettingsService.localCoordinates);
        const response = await firstValueFrom(this.httpService.get('https://api.open-meteo.com/v1/forecast', {
            params: {
                latitude: lat,
                longitude: long,
                daily: 'temperature_2m_max,temperature_2m_min',
                timezone: 'auto'
            }
        }));
        // index 1 : prevision du lendemain (index 0 = aujourd'hui)
        const value = Number(response.data.daily[forcastData][1]);
        return [{ value, isFormated: true, unit: '°C', name: sensor.name }];
    }
}
