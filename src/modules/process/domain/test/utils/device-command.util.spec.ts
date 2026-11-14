import { outcomeValues } from '@process/domain/utils/device-command.util';
import { DecodedValue, RegisterFunction, RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';

function CreateOutcome(value?: DecodedValue, overrides: Partial<RegisterOperationOutcome> = {}): RegisterOperationOutcome {
    return {
        isOk: true, blockId: 'block', operationId: 'read', durationMs: 1,
        request: { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 0, length: 1 },
        value, ...overrides
    };
}

describe('outcomeValues', () => {
    const fields: DecodedValue = {
        type: 'fields',
        fields: [
            { name: 'pv', label: 'Mesure', raw: 1234, value: 12.34, unit: 'bar' },
            { name: 'serial', label: 'Série', raw: 'AB', value: 'AB' },
            { name: 'decimals', label: 'Décimales', raw: 2, value: 2 }
        ]
    };

    it('should return every numeric field', () => {
        expect(outcomeValues(CreateOutcome(fields))).toEqual([
            { name: 'pv', value: 12.34, unit: 'bar' },
            { name: 'decimals', value: 2, unit: undefined }
        ]);
    });

    it('should return only the requested fields and throw when one is missing', () => {
        expect(outcomeValues(CreateOutcome(fields), ['pv'])).toEqual([{ name: 'pv', value: 12.34, unit: 'bar' }]);
        expect(outcomeValues(CreateOutcome(fields), [])).toHaveLength(outcomeValues(CreateOutcome(fields)).length);
        expect(() => outcomeValues(CreateOutcome(fields), ['pv', 'serial'])).toThrow('champ(s) numérique(s) "serial" absent(s)');
    });

    it('should return the single value of a number or version result', () => {
        expect(outcomeValues(CreateOutcome({ type: 'number', value: 7 }))).toEqual([{ name: 'block.read', value: 7 }]);
        expect(outcomeValues(CreateOutcome({ type: 'version', value: 1.02, text: 'V1.02' }))).toEqual([{ name: 'block.read', value: 1.02 }]);
    });

    it('should return one numeric entry per channel', () => {
        const channels: DecodedValue = { type: 'boolean[]', channels: [{ index: 0, number: 1, value: true }, { index: 1, number: 2, value: false }] };

        expect(outcomeValues(CreateOutcome(channels))).toEqual([
            { name: 'block.read.1', value: 1 },
            { name: 'block.read.2', value: 0 }
        ]);
    });

    it('should return nothing for an echo', () => {
        expect(outcomeValues(CreateOutcome({ type: 'echo' }))).toEqual([]);
    });

    it('should throw with the modbus label when the execution failed', () => {
        const failed = CreateOutcome(undefined, { isOk: false, error: { message: 'Modbus exception 2', modbusCode: 2, label: 'Illegal data address' } });

        expect(() => outcomeValues(failed)).toThrow('block.read : Modbus exception 2 (Illegal data address)');
    });
});
