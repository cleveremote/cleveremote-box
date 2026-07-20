import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ComRequest, ComRequestDocument } from '../comrequest.schema';
import { mapComRequestConfigToModel, mapComRequestConfigToSchema } from './com-request-config.mapper';

export class ModbusTaskMapper {

    public static mapToModel(task: ComRequestDocument): ComRequestModel {
        const model = new ComRequestModel();
        model._id = task._id.toString();
        model.deviceId = task.deviceId;
        model.name = task.name;
        model.description = task.description;
        model.type = task.type;
        model.config = mapComRequestConfigToModel(task.config);
        model.createdAt = (task as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (task as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = task.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: ComRequestModel): ComRequest {
        const task = new ComRequest();
        task.deviceId = model.deviceId;
        task.name = model.name;
        task.description = model.description;
        task.type = model.type;
        task.config = mapComRequestConfigToSchema(model.config);
        return task;
    }

}
