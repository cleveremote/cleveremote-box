import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ComSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { ComSensorStrategy } from '@process/domain/services/sensor-strategies/com-sensor.strategy';

function CreateComSensorModel(): SensorModel {
    const sensor = new SensorModel();
    sensor.type = SensorType.COM;
    sensor.config = new ComSensorConfigModel();
    sensor.config.cronPattern = '*/30 * * * * *';
    sensor.config.comRequestId = 'request-1';
    return sensor;
}

describe('ComSensorStrategy', () => {
    const strategy = new ComSensorStrategy();

    it('should have the COM type', () => {
        expect(strategy.type).toEqual(SensorType.COM);
    });

    it('should throw NotImplementedError on read', async () => {
        const sensor = CreateComSensorModel();

        await expect(strategy.read(sensor)).rejects.toThrow(NotImplementedError);
    });
});
