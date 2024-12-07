import { ValueModel } from '@process/domain/models/value.model';
import { ProcessValueEntity } from './process-value.entity';
import { SensorValueEntity } from './sensor-value.entity';

export class ValueEntity extends ValueModel {

    public static mapToModel(entity: ValueEntity): ValueModel {
        const model = new ValueModel();
        model.processes = [];
        model.sensors = [];

        entity.processes.forEach(entity => {
            model.processes.push(ProcessValueEntity.mapToModel(entity));
        });

        entity.sensors.forEach(entity => {
            model.sensors.push(SensorValueEntity.mapToModel(entity));
        });

        return model;
    }

    public static mapToEntity(model: ValueModel): ValueEntity {
        const entity = new ValueEntity();
        entity.processes = [];
        entity.sensors = [];

        model.processes.forEach(model => {
            entity.processes.push(ProcessValueEntity.mapToModel(model));
        });

        model.sensors.forEach(model => {
            entity.sensors.push(SensorValueEntity.mapToModel(model));
        });

        return entity;
    }

}

