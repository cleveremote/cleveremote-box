import { ComRequestConfigModel } from '@process/domain/models/com-request.model';
import { ComRequestConfig } from '../comrequest.schema';

export function mapComRequestConfigToModel(config: ComRequestConfig): ComRequestConfigModel {
    return {
        address: config.address,
        function: config.function,
        disabled: config.disabled,
        done: config.done ?? false,
        ...(config.params !== undefined && {
            params: {
                length: config.params.length,
                scale: config.params.scale,
                unit: config.params.unit,
                value: config.params.value,
                ...(config.params.persistence !== undefined && {
                    persistence: {
                        persist: config.params.persistence.persist,
                        address: config.params.persistence.address
                    }
                })
            }
        })
    };
}

export function mapComRequestConfigToSchema(config: ComRequestConfigModel): ComRequestConfig {
    return {
        address: config.address,
        function: config.function,
        disabled: config.disabled,
        done: config.done ?? false,
        ...(config.params !== undefined && {
            params: {
                length: config.params.length,
                scale: config.params.scale,
                unit: config.params.unit,
                value: config.params.value,
                ...(config.params.persistence !== undefined && {
                    persistence: {
                        persist: config.params.persistence.persist,
                        address: config.params.persistence.address
                    }
                })
            }
        })
    };
}
