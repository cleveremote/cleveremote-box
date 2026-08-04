import { ComSensorConfigModel, ForcastSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { Sensor, SensorDocument } from '../sensor.schema';

export class SensorMapper {

    public static mapToModel(sensor: SensorDocument): SensorModel {
        const model = new SensorModel();
        model._id = sensor._id.toString();
        model.name = sensor.name;
        model.description = sensor.description;
        model.style = sensor.style;
        model.type = sensor.type;
        model.parentId = sensor.parentId ?? null;
        model.isEnabled = sensor.isEnabled;
        model.display = sensor.display;
        model.config = SensorMapper._mapConfigToModel(sensor);
        model.createdAt = (sensor as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (sensor as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = sensor.deletedAt ?? null;
        return model;
    }

    private static _mapConfigToModel(sensor: SensorDocument): ForcastSensorConfigModel | ComSensorConfigModel {
        if (sensor.type === SensorType.FORCAST) {
            const config = new ForcastSensorConfigModel();
            config.cronPattern = sensor.config.cronPattern;
            config.forcastData = sensor.config.forcastData;
            return config;
        }
        if (sensor.parentId) {
            const config = new ComSensorConfigModel();
            config.code = sensor.config.code;
            config.scale = sensor.config.scale;
            config.unit = sensor.config.unit;
            return config;
        }
        const config = new ComSensorConfigModel();
        config.cronPattern = sensor.config.cronPattern;
        config.comRequestId = sensor.config.comRequestId;
        return config;
    }

    public static mapToSchema(model: SensorModel): Sensor {
        const sensor = new Sensor();
        sensor.name = model.name;
        sensor.description = model.description;
        sensor.style = model.style;
        sensor.type = model.type;
        sensor.parentId = model.parentId ?? null;
        sensor.isEnabled = model.isEnabled ?? true;
        sensor.display = model.display ?? true;
        if (model.type === SensorType.FORCAST) {
            const config = model.config as ForcastSensorConfigModel;
            sensor.config = { cronPattern: config.cronPattern, forcastData: config.forcastData };
        } else if (sensor.parentId) {
            const config = model.config as ComSensorConfigModel;
            sensor.config = { code: config.code, scale: config.scale, unit: config.unit };
        } else {
            const config = model.config as ComSensorConfigModel;
            sensor.config = { cronPattern: config.cronPattern, comRequestId: config.comRequestId };
        }
        return sensor;
    }

}
