import { SensorEntity } from '@process/infrastructure/entities/sensor.entity';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName, SensorModel } from '@process/domain/models/sensor.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';

describe('SensorEntity', () => {
    it('should map a FORCAST entity to a model with its config copied', () => {
        const entity = Object.assign(new SensorEntity(), {
            id: 'sensor-1', name: 'sensor', description: 'd',
            style: { bgColor: 'a', fontColor: 'b', iconColor: { base: 'c', icon: 'd' } },
            type: SensorType.FORCAST,
            config: Object.assign(new ForcastSensorConfigModel(), { cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX })
        });

        const model = SensorEntity.mapToModel(entity);

        expect(model).toEqual(expect.objectContaining({
            id: 'sensor-1', name: 'sensor', type: SensorType.FORCAST
        }));
        expect(model.config).toEqual(expect.objectContaining({ cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX }));
    });

    it('should map a COM model to an entity with its config copied', () => {
        const model = Object.assign(new SensorModel(), {
            id: 'sensor-2', name: 'sensor', description: 'd', type: SensorType.COM,
            config: Object.assign(new ComSensorConfigModel(), { cronPattern: '*/30 * * * * *', comRequestId: 'request-1' })
        });

        const result = SensorEntity.mapToEntity(model);

        expect(result).toEqual(expect.objectContaining({ id: 'sensor-2', name: 'sensor', type: SensorType.COM }));
        expect(result.config).toEqual(expect.objectContaining({ cronPattern: '*/30 * * * * *', comRequestId: 'request-1' }));
    });
});
