/* eslint-disable max-lines-per-function */
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';

export class ProcessValueEntity extends ProcessValueModel {

    public static mapToModel(entity: ProcessValueEntity): ProcessValueModel {
        const model = new ProcessValueModel();
        model.id = entity.id;
        model.type = entity.type;
        model.status = entity.status;
        model.startedAt = entity.startedAt;
        model.duration = entity.duration;

        return model;
    }

    public static mapToEntity(model: ProcessValueModel): ProcessValueEntity {
        const entity = new ProcessValueEntity();
        entity.id = model.id;
        entity.type = model.type;
        entity.status = model.status;
        entity.startedAt = model.startedAt;
        entity.duration = model.duration;

        return entity;
    }

}

