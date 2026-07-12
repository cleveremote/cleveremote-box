import { ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequest, ComRequestDocument } from '../comrequest.schema';

export class ModbusTaskMapper {

    public static mapToModel(task: ComRequestDocument): ComRequestModel {
        const model = new ComRequestModel();
        model._id = task._id.toString();
        model.deviceId = task.connectionId;
        model.name = task.label;
        model.config = {
            function: task.function as ModbusFunctionName,
            address: task.address,
            params: task.params
        };
        model.createdAt = (task as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (task as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = task.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: ComRequestModel): ComRequest {
        const task = new ComRequest();
        task.connectionId = model.deviceId;
        task.function = model.config.function;
        task.label = model.name;
        task.address = model.config.address;
        task.params = model.config.params;
        return task;
    }

}
