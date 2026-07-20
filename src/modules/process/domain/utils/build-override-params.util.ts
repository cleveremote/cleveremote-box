import { ComRequestConfigModel } from '@process/domain/models/com-request.model';

export function buildOverrideParams(params: ComRequestConfigModel, overrideParams: Partial<ComRequestConfigModel>): ComRequestConfigModel {
    return ({
        address: overrideParams.address ?? params.address,
        function: overrideParams.function ?? params.function,
        disabled: overrideParams.disabled ?? params.disabled,
        params: {
            length: overrideParams.params?.length ?? params.params?.length,
            scale: overrideParams.params?.scale ?? params.params?.scale,
            unit: overrideParams.params?.unit ?? params.params?.unit,
            value: overrideParams.params?.value ?? params.params?.value,
            persistence: {
                persist: overrideParams.params?.persistence?.persist ?? params.params?.persistence?.persist ?? false,
                address: overrideParams.params?.persistence?.address ?? params.params?.persistence?.address ?? 0
            }
        }
    });
}
