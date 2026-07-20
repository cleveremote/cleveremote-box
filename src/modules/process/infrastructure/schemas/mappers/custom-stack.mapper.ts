import { ComRequestConfigModel } from '@process/domain/models/com-request.model';
import { CustomStack } from '../sequence.schema';
import { mapComRequestConfigToModel, mapComRequestConfigToSchema } from './com-request-config.mapper';

type CustomStackModel = { comRequestId: string; params?: ComRequestConfigModel; defaultParams?: ComRequestConfigModel };

export class CustomStackMapper {

    public static mapToModel(customStack: CustomStack): CustomStackModel {
        return {
            comRequestId: customStack.comRequestId,
            ...(customStack.params !== undefined && { params: mapComRequestConfigToModel(customStack.params) }),
            ...(customStack.defaultParams !== undefined && { defaultParams: mapComRequestConfigToModel(customStack.defaultParams) })
        };
    }

    public static mapToSchema(customStack: CustomStackModel): CustomStack {
        const schema = new CustomStack();
        schema.comRequestId = customStack.comRequestId;
        if (customStack.params !== undefined) {
            schema.params = mapComRequestConfigToSchema(customStack.params);
        }
        if (customStack.defaultParams !== undefined) {
            schema.defaultParams = mapComRequestConfigToSchema(customStack.defaultParams);
        }
        return schema;
    }

}
