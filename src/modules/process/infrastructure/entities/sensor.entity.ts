/* eslint-disable max-lines-per-function */
import { SensorModel } from '@process/domain/models/sensor.model';

export class SensorEntity extends SensorModel {

    public static mapToModel(sensorEntity: SensorEntity): SensorModel {
        const sensor = new SensorModel();
        sensor.id = sensorEntity.id;
        sensor.name = sensorEntity.name;
        sensor.description = sensorEntity.description;
        sensor.style = sensorEntity.style;
        sensor.id = sensorEntity.id;
        sensor.type = sensorEntity.type;
        sensor.unit = sensorEntity.unit;
        return sensor;
    }

    public static mapToEntity(sensorModel: SensorModel): SensorEntity {
        const sensor = new SensorModel();
        sensor.id = sensorModel.id;
        sensor.name = sensorModel.name;
        sensor.description = sensorModel.description;
        sensor.style = sensorModel.style;
        sensor.id = sensorModel.id;
        sensor.type = sensorModel.type;
        sensor.unit = sensorModel.unit;
        return sensor;
    }

}

