import { ComRequestConfigModel, ModbusFunctionName, ModbusValueType } from '@process/domain/models/com-request.model';

export interface BuildOverrideParamsCase {
    name: string;
    existing: ComRequestConfigModel;
    override: Partial<ComRequestConfigModel>;
    expected: ComRequestConfigModel;
}

// Test cases for the shared buildOverrideParams util (domain/utils/build-override-params.util.ts),
// used by ctrl-actuator.strategy.ts, com-actuator.strategy.ts and inverter-device.strategy.ts.
// Every field (address/function/disabled/length/scale/unit/value, and the persistence sub-object)
// is merged with `??`: an explicitly-provided override value always wins - including `0`/`false`/
// `[]`, which are legitimate values (e.g. address/channel 0, writeCoil value 0) - and the existing
// config is only used as a fallback when the override field is truly absent (`undefined`).
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
        name: 'the override wins on address/value even when explicitly 0',
        existing: { address: 5, function: [ModbusFunctionName.READ_HOLDING_REGISTERS], params: { value: 42, length: 2, scale: 10, unit: 'C' } },
        override: { address: 0, params: { value: 0 } },
        expected: {
            address: 0,
            function: [ModbusFunctionName.READ_HOLDING_REGISTERS],
            disabled: undefined,
            params: {
                length: 2,
                scale: 10,
                unit: 'C',
                value: 0,
                persistence: { persist: false, address: 0 }
            }
        }
    },
    {
        name: 'the existing config wins on address/value when the override omits them entirely',
        existing: { address: 5, function: [ModbusFunctionName.READ_HOLDING_REGISTERS], params: { value: 42, length: 2, scale: 10, unit: 'C' } },
        override: {},
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
    },
    {
        name: 'the override wins on type/formula, falling back to the existing config when absent',
        existing: { address: 5, function: [], type: ModbusValueType.FLOAT, params: { value: 42, formula: 'raw' } },
        override: { address: 1, type: ModbusValueType.CUMULATIVE, params: { value: 7 } },
        expected: {
            address: 1,
            function: [],
            disabled: undefined,
            type: ModbusValueType.CUMULATIVE,
            params: {
                length: undefined,
                scale: undefined,
                unit: undefined,
                value: 7,
                formula: 'raw',
                persistence: { persist: false, address: 0 }
            }
        }
    }
];
