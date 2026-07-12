import { ComSensorConfigModel, ForcastSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';

export class SensorEntity extends SensorModel {

    public static mapToModel(sensorEntity: SensorEntity): SensorModel {
        const model = new SensorModel();
        model.id = sensorEntity.id;
        model.name = sensorEntity.name;
        model.description = sensorEntity.description;
        model.style = sensorEntity.style;
        model.type = sensorEntity.type;
        model.config = SensorEntity._copyConfig(sensorEntity.type, sensorEntity.config);
        return model;
    }

    public static mapToEntity(sensorModel: SensorModel): SensorEntity {
        const entity = new SensorEntity();
        entity.id = sensorModel.id;
        entity.name = sensorModel.name;
        entity.description = sensorModel.description;
        entity.style = sensorModel.style;
        entity.type = sensorModel.type;
        entity.config = SensorEntity._copyConfig(sensorModel.type, sensorModel.config);
        return entity;
    }

    private static _copyConfig(
        type: SensorType,
        config: ForcastSensorConfigModel | ComSensorConfigModel
    ): ForcastSensorConfigModel | ComSensorConfigModel {
        if (type === SensorType.FORCAST) {
            return Object.assign(new ForcastSensorConfigModel(), config as ForcastSensorConfigModel);
        }
        return Object.assign(new ComSensorConfigModel(), config as ComSensorConfigModel);
    }

}
