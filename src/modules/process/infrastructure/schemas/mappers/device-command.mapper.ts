import { DeviceCommandModel } from '@process/domain/models/device-command.model';
import { DeviceCommand, DeviceCommandDocument } from '../device-command.schema';

export class DeviceCommandMapper {

    public static mapToModel(command: DeviceCommandDocument): DeviceCommandModel {
        const model = new DeviceCommandModel();
        model._id = command._id.toString();
        model.deviceId = command.deviceId;
        model.name = command.name;
        model.description = command.description;
        model.blockId = command.blockId;
        model.operationId = command.operationId;
        model.channel = command.channel;
        model.value = command.value;
        model.isPersistent = command.isPersistent;
        model.isConfirmed = command.isConfirmed;
        model.createdAt = (command as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (command as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = command.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: DeviceCommandModel): DeviceCommand {
        const command = new DeviceCommand();
        command.deviceId = model.deviceId;
        command.name = model.name;
        command.description = model.description;
        command.blockId = model.blockId;
        command.operationId = model.operationId;
        command.channel = model.channel;
        command.value = model.value;
        command.isPersistent = model.isPersistent;
        command.isConfirmed = model.isConfirmed;
        return command;
    }

}
