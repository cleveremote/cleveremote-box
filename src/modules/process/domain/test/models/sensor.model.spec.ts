import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName, SensorModel } from '@process/domain/models/sensor.model';

describe('SensorModel', () => {
    it('should default deletedAt to null', () => {
        const sensor = new SensorModel();

        expect(sensor.deletedAt).toBeNull();
    });

    it('should default parentId to null', () => {
        const sensor = new SensorModel();

        expect(sensor.parentId).toBeNull();
    });

    it('should hold FORCAST-specific config fields when type is FORCAST', () => {
        const sensor = new SensorModel();
        sensor.type = SensorType.FORCAST;
        sensor.id = '1';
        sensor.name = 'forecast max';
        sensor.config = new ForcastSensorConfigModel();
        sensor.config.cronPattern = '0 0 * * *';
        sensor.config.forcastData = forcastDataName.TEMPERATURE_2M_MAX;

        expect(sensor.type).toEqual(SensorType.FORCAST);
        expect(sensor.config.cronPattern).toEqual('0 0 * * *');
        expect(sensor.config.forcastData).toEqual(forcastDataName.TEMPERATURE_2M_MAX);
    });

    it('should hold COM-specific config fields when type is COM', () => {
        const sensor = new SensorModel();
        sensor.type = SensorType.COM;
        sensor.id = '2';
        sensor.name = 'com sensor';
        sensor.config = new ComSensorConfigModel();
        sensor.config.cronPattern = '*/30 * * * * *';
        sensor.config.comRequestId = 'request-1';

        expect(sensor.type).toEqual(SensorType.COM);
        expect(sensor.config.cronPattern).toEqual('*/30 * * * * *');
        expect(sensor.config.comRequestId).toEqual('request-1');
    });

    it('should hold child-specific config fields (code, scale, unit) when parentId is set', () => {
        const sensor = new SensorModel();
        sensor.type = SensorType.COM;
        sensor.id = '3';
        sensor.name = 'child sensor';
        sensor.parentId = 'parent-1';
        sensor.config = new ComSensorConfigModel();
        sensor.config.code = 12;
        sensor.config.scale = 0.1;
        sensor.config.unit = 'V';

        expect(sensor.parentId).toEqual('parent-1');
        expect(sensor.config.code).toEqual(12);
        expect(sensor.config.scale).toEqual(0.1);
        expect(sensor.config.unit).toEqual('V');
    });
});
