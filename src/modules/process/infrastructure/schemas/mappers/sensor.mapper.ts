import { AnalogScalingModel, AnalogSensorConfigModel, ComSensorConfigModel, ForcastSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { AnalogScaling, Sensor, SensorConfig, SensorDocument } from '../sensor.schema';

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

    private static _mapConfigToModel(sensor: SensorDocument): ForcastSensorConfigModel | ComSensorConfigModel | AnalogSensorConfigModel {
        if (sensor.type === SensorType.FORCAST) {
            const config = new ForcastSensorConfigModel();
            config.cronPattern = sensor.config.cronPattern;
            config.forcastData = sensor.config.forcastData;
            return config;
        }
        // ANALOG : config COM (racine ou enfant) + mise à l'échelle
        const config = sensor.type === SensorType.ANALOG ? new AnalogSensorConfigModel() : new ComSensorConfigModel();
        config.field = sensor.config.field;
        if (!sensor.parentId) {
            config.cronPattern = sensor.config.cronPattern;
            config.commandId = sensor.config.commandId;
            config.deviceId = sensor.config.deviceId;
        }
        if (config instanceof AnalogSensorConfigModel) {
            config.scaling = SensorMapper._mapScalingToModel(sensor.config.scaling);
        }
        return config;
    }

    private static _mapScalingToModel(scaling: AnalogScaling | undefined): AnalogScalingModel | undefined {
        if (!scaling) {
            return undefined;
        }
        const model = new AnalogScalingModel();
        model.signalType = scaling.signalType;
        model.inputMin = scaling.inputMin;
        model.inputMax = scaling.inputMax;
        model.outputMin = scaling.outputMin;
        model.outputMax = scaling.outputMax;
        model.unit = scaling.unit;
        model.outOfRange = scaling.outOfRange ?? model.outOfRange;
        return model;
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
            return sensor;
        }
        const config = model.config as ComSensorConfigModel;
        sensor.config = sensor.parentId
            ? { field: config.field }
            : { cronPattern: config.cronPattern, commandId: config.commandId, deviceId: config.deviceId, field: config.field };
        if (model.type === SensorType.ANALOG) {
            sensor.config.scaling = SensorMapper._mapScalingToSchema((model.config as AnalogSensorConfigModel).scaling);
        }
        return sensor;
    }

    private static _mapScalingToSchema(scaling: AnalogScalingModel | undefined): SensorConfig['scaling'] {
        if (!scaling) {
            return undefined;
        }
        const { signalType, inputMin, inputMax, outputMin, outputMax, unit, outOfRange } = scaling;
        return { signalType, inputMin, inputMax, outputMin, outputMax, unit, outOfRange };
    }

}
