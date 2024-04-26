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
        model.causes = [];
        if (entity.causes?.length > 0) {
            entity.causes.forEach(cause => {
                model.causes.push(cause);
            });
        }
        return model;
    }

    public static mapToEntity(model: ProcessValueModel): ProcessValueEntity {
        const entity = new ProcessValueEntity();
        entity.id = model.id;
        entity.type = model.type;
        entity.status = model.status;
        entity.startedAt = model.startedAt;
        entity.duration = model.duration;
        entity.causes = [];
        if (model.causes?.length > 0) {
            model.causes.forEach(cause => {
                entity.causes.push(cause);
            });
        }
        return entity;
    }

}

