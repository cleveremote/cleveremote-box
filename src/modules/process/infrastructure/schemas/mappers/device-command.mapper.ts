import { DeviceCommandModel } from '@process/domain/models/device-command.model';
import { DeviceCommand, DeviceCommandDocument } from '../device-command.schema';

export class DeviceCommandMapper {

    public static mapToModel(command: DeviceCommandDocument): DeviceCommandModel {
        const model = new DeviceCommandModel();
        model._id = command._id.toString();
        model.modelId = command.modelId;
        model.name = command.name;
        model.description = command.description;
        model.blockId = command.blockId;
        model.operationId = command.operationId;
        model.channel = command.channel;
        model.value = command.value;
        model.isPersistent = command.isPersistent;
        model.isConfirmed = command.isConfirmed;
        model.autoCreate = command.autoCreate ?? false;
        model.types = [...(command.types ?? [])];
        model.fields = command.fields?.length ? [...command.fields] : undefined;
        model.params = command.params;
        model.createdAt = (command as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (command as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = command.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: DeviceCommandModel): DeviceCommand {
        const command = new DeviceCommand();
        command.modelId = model.modelId;
        command.name = model.name;
        command.description = model.description;
        command.blockId = model.blockId;
        command.operationId = model.operationId;
        command.channel = model.channel;
        command.value = model.value;
        command.isPersistent = model.isPersistent;
        command.isConfirmed = model.isConfirmed;
        command.autoCreate = model.autoCreate ?? false;
        command.types = [...(model.types ?? [])];
        command.fields = model.fields && [...model.fields];
        command.params = model.params;
        return command;
    }

}
