import { ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequest, ComRequestDocument } from '../comrequest.schema';

export class ModbusTaskMapper {

    public static mapToModel(task: ComRequestDocument): ComRequestModel {
        const model = new ComRequestModel();
        model._id = task._id.toString();
        model.deviceId = task.deviceId;
        model.name = task.name;
        model.description = task.description;
        model.type = task.type;
        model.config = {
            function: task.function as ModbusFunctionName[],
            address: task.address,
            disabled: task.disabled,
            done: task.done ?? false,
            params: task.params
        };
        model.createdAt = (task as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (task as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = task.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: ComRequestModel): ComRequest {
        const task = new ComRequest();
        task.deviceId = model.deviceId;
        task.function = model.config.function;
        task.name = model.name;
        task.description = model.description;
        task.type = model.type;
        task.address = model.config.address;
        task.disabled = model.config.disabled;
        task.done = model.config.done ?? false;
        task.params = model.config.params;
        return task;
    }

}
