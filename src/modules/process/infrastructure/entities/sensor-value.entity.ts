import { SensorValueModel } from '@process/domain/models/sensor-value.model';

export class SensorValueEntity extends SensorValueModel {

    public static mapToModel(entity: SensorValueEntity): SensorValueModel {
        const model = new SensorValueModel();
        model.id = entity.id;
        model.type = entity.type;
        model.value = entity.value;

        return model;
    }

    public static mapToEntity(model: SensorValueModel): SensorValueEntity {
        const entity = new SensorValueEntity();
        entity.id = model.id;
        entity.type = model.type;
        entity.value = model.value;

        return entity;
    }

}