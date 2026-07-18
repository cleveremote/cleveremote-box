import { ComRequestConfigModel } from '@process/domain/models/com-request.model';
import { ComRequestConfig } from '../comrequest.schema';
import { CustomStack } from '../sequence.schema';

type CustomStackModel = { comRequestId: string; params?: ComRequestConfigModel; defaultParams?: ComRequestConfigModel };

function mapConfigToModel(config: ComRequestConfig): ComRequestConfigModel {
    return {
        address: config.address,
        function: config.function,
        disabled: config.disabled,
        done: config.done ?? false,
        params: {
            length: config.params?.length,
            scale: config.params?.scale,
            unit: config.params?.unit,
            value: config.params?.value,
            ...(config.params?.persistence !== undefined && {
                persistence: {
                    persist: config.params.persistence.persist,
                    address: config.params.persistence.address
                }
            })
        }
    };
}

function mapConfigToSchema(config: ComRequestConfigModel): ComRequestConfig {
    return {
        address: config.address,
        function: config.function,
        disabled: config.disabled,
        done: config.done ?? false,
        params: {
            length: config.params?.length,
            scale: config.params?.scale,
            unit: config.params?.unit,
            value: config.params?.value,
            ...(config.params?.persistence !== undefined && {
                persistence: {
                    persist: config.params.persistence.persist,
                    address: config.params.persistence.address
                }
            })
        }
    };
}

export class CustomStackMapper {

    public static mapToModel(customStack: CustomStack): CustomStackModel {
        return {
            comRequestId: customStack.comRequestId,
            ...(customStack.params !== undefined && { params: mapConfigToModel(customStack.params) }),
            ...(customStack.defaultParams !== undefined && { defaultParams: mapConfigToModel(customStack.defaultParams) })
        };
    }

    public static mapToSchema(customStack: CustomStackModel): CustomStack {
        const schema = new CustomStack();
        schema.comRequestId = customStack.comRequestId;
        if (customStack.params !== undefined) {
            schema.params = mapConfigToSchema(customStack.params);
        }
        if (customStack.defaultParams !== undefined) {
            schema.defaultParams = mapConfigToSchema(customStack.defaultParams);
        }
        return schema;
    }

}
