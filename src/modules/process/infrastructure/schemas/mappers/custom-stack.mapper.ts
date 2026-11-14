import { DeviceCommandOverride } from '@process/domain/models/device-command.model';
import { CustomStackModel } from '@process/domain/models/sequence.model';
import { CustomStack } from '../sequence.schema';

export class CustomStackMapper {

    public static mapToModel(customStack: CustomStack): CustomStackModel {
        return {
            commandId: customStack.commandId,
            deviceId: customStack.deviceId,
            ...(customStack.params !== undefined && { params: CustomStackMapper._override(customStack.params) }),
            ...(customStack.defaultParams !== undefined && { defaultParams: CustomStackMapper._override(customStack.defaultParams) })
        };
    }

    public static mapToSchema(customStack: CustomStackModel): CustomStack {
        const schema = new CustomStack();
        schema.commandId = customStack.commandId;
        schema.deviceId = customStack.deviceId;
        if (customStack.params !== undefined) {
            schema.params = CustomStackMapper._override(customStack.params);
        }
        if (customStack.defaultParams !== undefined) {
            schema.defaultParams = CustomStackMapper._override(customStack.defaultParams);
        }
        return schema;
    }

    private static _override(override: DeviceCommandOverride): DeviceCommandOverride {
        return { channel: override.channel, value: override.value };
    }

}
