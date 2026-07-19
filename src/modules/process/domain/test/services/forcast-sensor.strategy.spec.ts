import { of, throwError } from 'rxjs';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ForcastSensorConfigModel, forcastDataName, SensorModel } from '@process/domain/models/sensor.model';
import { ForcastSensorStrategy } from '@process/domain/services/sensor-strategies/forcast-sensor.strategy';

function CreateForcastSensorModel(forcastData: forcastDataName): SensorModel {
    const sensor = new SensorModel();
    sensor.type = SensorType.FORCAST;
    const config = new ForcastSensorConfigModel();
    config.cronPattern = '0 0 * * *';
    config.forcastData = forcastData;
    sensor.config = config;
    return sensor;
}

describe('ForcastSensorStrategy', () => {
    let httpService: { get: jest.Mock };
    let strategy: ForcastSensorStrategy;

    beforeEach(() => {
        httpService = {
            // eslint-disable-next-line camelcase -- forme imposee par l'API meteo externe (open-meteo)
            get: jest.fn().mockReturnValue(of({ data: { daily: { temperature_2m_max: [20, 25], temperature_2m_min: [10, 12] } } }))
        };
        strategy = new ForcastSensorStrategy(httpService as never);
    });

    it('should have the FORCAST type', () => {
        expect(strategy.type).toEqual(SensorType.FORCAST);
    });

    it('should read tomorrow\'s max temperature from the weather API', async () => {
        const sensor = CreateForcastSensorModel(forcastDataName.TEMPERATURE_2M_MAX);

        const result = await strategy.read(sensor);

        expect(result).toEqual([{ value: 25, isFormated: true, unit: '°C', name: sensor.name }]);
        expect(httpService.get).toHaveBeenCalledWith(
            'https://api.open-meteo.com/v1/forecast',
            expect.objectContaining({ params: expect.objectContaining({ daily: 'temperature_2m_max,temperature_2m_min' }) })
        );
    });

    it('should read tomorrow\'s min temperature from the weather API', async () => {
        const sensor = CreateForcastSensorModel(forcastDataName.TEMPERATURE_2M_MIN);

        const result = await strategy.read(sensor);

        expect(result).toEqual([{ value: 12, isFormated: true, unit: '°C', name: sensor.name }]);
    });

    it('should propagate a failing weather API call', async () => {
        httpService.get.mockReturnValue(throwError(() => new Error('network down')));
        const sensor = CreateForcastSensorModel(forcastDataName.TEMPERATURE_2M_MAX);

        await expect(strategy.read(sensor)).rejects.toThrow('network down');
    });
});
