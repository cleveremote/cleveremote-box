import { ComRequestConfigModel, ModbusFunctionName } from '@process/domain/models/com-request.model';

export interface BuildOverrideParamsCase {
    name: string;
    existing: ComRequestConfigModel;
    override: ComRequestConfigModel;
    expected: ComRequestConfigModel;
}

// Test cases for the shared buildOverrideParams util (domain/utils/build-override-params.util.ts),
// used by ctrl-actuator.strategy.ts, com-actuator.strategy.ts and inverter-device.strategy.ts.
// It merges `||`-fallback fields (address/function/disabled/length/scale/unit/value) and a
// `??`-chained persistence sub-object (override -> existing -> hard default).
export const buildOverrideParamsCases: BuildOverrideParamsCase[] = [
    {
        name: 'the override wins on address/value when both are truthy',
        existing: { address: 5, function: [ModbusFunctionName.READ_HOLDING_REGISTERS], params: { value: 42 } },
        override: { address: 1, params: { value: 7 } },
        expected: {
            address: 1,
            function: [ModbusFunctionName.READ_HOLDING_REGISTERS],
            disabled: undefined,
            params: {
                length: undefined,
                scale: undefined,
                unit: undefined,
                value: 7,
                persistence: { persist: false, address: 0 }
            }
        }
    },
    {
        name: 'the existing config wins on address/value when the override is falsy/absent',
        existing: { address: 5, function: [ModbusFunctionName.READ_HOLDING_REGISTERS], params: { value: 42, length: 2, scale: 10, unit: 'C' } },
        override: { address: 0, params: { value: 0 } },
        expected: {
            address: 5,
            function: [ModbusFunctionName.READ_HOLDING_REGISTERS],
            disabled: undefined,
            params: {
                length: 2,
                scale: 10,
                unit: 'C',
                value: 42,
                persistence: { persist: false, address: 0 }
            }
        }
    },
    {
        name: 'the override supplies persistence explicitly',
        existing: { address: 5, function: [], params: { value: 42 } },
        override: { address: 1, params: { value: 7, persistence: { persist: true, address: 12 } } },
        expected: {
            address: 1,
            function: [],
            disabled: undefined,
            params: {
                length: undefined,
                scale: undefined,
                unit: undefined,
                value: 7,
                persistence: { persist: true, address: 12 }
            }
        }
    },
    {
        name: 'the existing config supplies persistence when the override omits it',
        existing: { address: 5, function: [], params: { value: 42, persistence: { persist: true, address: 9 } } },
        override: { address: 1, params: { value: 7 } },
        expected: {
            address: 1,
            function: [],
            disabled: undefined,
            params: {
                length: undefined,
                scale: undefined,
                unit: undefined,
                value: 7,
                persistence: { persist: true, address: 9 }
            }
        }
    },
    {
        name: 'the hard default is used when neither side supplies persistence',
        existing: { address: 5, function: [], params: { value: 42 } },
        override: { address: 1, params: { value: 7 } },
        expected: {
            address: 1,
            function: [],
            disabled: undefined,
            params: {
                length: undefined,
                scale: undefined,
                unit: undefined,
                value: 7,
                persistence: { persist: false, address: 0 }
            }
        }
    }
];
