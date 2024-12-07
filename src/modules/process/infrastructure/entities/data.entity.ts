import { DataModel } from '@process/domain/models/data.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';

export class DataEntity extends DataModel {

    public static mapToModel(entity: DataEntity): DataModel {
        const model = new DataModel();
        model.id = entity.id;
        model.type = entity.type;
        model.deviceId = entity.deviceId;
        model.date = entity.date;
        model.value = entity.value; 
        return model;
    }

    public static mapToEntity(model: DataModel): DataEntity {
        const entity = new DataEntity();
        entity.id = model.id;
        entity.type = model.type;
        entity.value = model.value;
        entity.deviceId = model.deviceId;
        entity.date = model.date;

        return entity;
    }

}