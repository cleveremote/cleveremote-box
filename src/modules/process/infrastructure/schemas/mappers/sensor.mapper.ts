import { ComSensorConfigModel, ForcastSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { Sensor, SensorDocument } from '../sensor.schema';

export class SensorMapper {

    public static mapToModel(sensor: SensorDocument): SensorModel {
        const model = new SensorModel();
        model.id = sensor._id.toString();
        model.name = sensor.name;
        model.description = sensor.description;
        model.style = sensor.style;
        model.type = sensor.type;
        if (sensor.type === SensorType.FORCAST) {
            const config = new ForcastSensorConfigModel();
            config.cronPattern = sensor.config.cronPattern;
            config.forcastData = sensor.config.forcastData;
            model.config = config;
        } else {
            const config = new ComSensorConfigModel();
            config.cronPattern = sensor.config.cronPattern;
            config.comRequestId = sensor.config.comRequestId;
            model.config = config;
        }
        model.createdAt = (sensor as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (sensor as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = sensor.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: SensorModel): Sensor {
        const sensor = new Sensor();
        sensor.name = model.name;
        sensor.description = model.description;
        sensor.style = model.style;
        sensor.type = model.type;
        if (model.type === SensorType.FORCAST) {
            const config = model.config as ForcastSensorConfigModel;
            sensor.config = { cronPattern: config.cronPattern, forcastData: config.forcastData };
        } else {
            const config = model.config as ComSensorConfigModel;
            sensor.config = { cronPattern: config.cronPattern, comRequestId: config.comRequestId };
        }
        return sensor;
    }

}
