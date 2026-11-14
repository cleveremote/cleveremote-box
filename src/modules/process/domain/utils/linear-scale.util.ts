import { AnalogConversionError } from '../errors/analog-conversion.error';
import { BoxErrorCode } from '@framework/errors/box-error';

// Comportement d'une valeur hors de la plage d'entrée
export enum OutOfRangePolicy {
    // valeur extrapolée par la formule linéaire
    EXTRAPOLATE = 'EXTRAPOLATE',
    // entrée ramenée à la borne la plus proche : sortie exactement à outputMin / outputMax
    CLAMP = 'CLAMP',
    // valeur rejetée (AnalogConversionError)
    ERROR = 'ERROR',
}

// Plage [min, max] ; min > max admis (plage inversée)
export interface LinearRange {
    min: number;
    max: number;
}

/** Bornes finies et plage d'entrée non dégénérée (min !== max), sinon AnalogConversionError */
export function assertValidLinearRanges(input: LinearRange, output: LinearRange): void {
    const bounds = [input?.min, input?.max, output?.min, output?.max];
    if (!bounds.every((bound) => typeof bound === 'number' && Number.isFinite(bound))) {
        throw new AnalogConversionError(`linearScale : bornes non numériques (entrée [${input?.min}, ${input?.max}], sortie [${output?.min}, ${output?.max}])`,
            BoxErrorCode.ANALOG_BOUNDS_INVALID);
    }
    if (input.min === input.max) {
        throw new AnalogConversionError(`linearScale : plage d'entrée dégénérée (min = max = ${input.min})`, BoxErrorCode.ANALOG_RANGE_DEGENERATE,
            { min: input.min });
    }
}

/**
 * Mise à l'échelle linéaire de `value` de la plage `input` vers la plage `output` (plages inversées admises), sans arrondi :
 * output = outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin).
 * Hors de la plage d'entrée : selon `policy`. Valeur non numérique ou plages invalides : AnalogConversionError.
 */
export function linearScale(value: number, input: LinearRange, output: LinearRange, policy: OutOfRangePolicy = OutOfRangePolicy.CLAMP): number {
    assertValidLinearRanges(input, output);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AnalogConversionError(`linearScale : valeur non numérique (${value})`,
            BoxErrorCode.ANALOG_VALUE_NOT_NUMERIC, { value: String(value) });
    }
    const low = Math.min(input.min, input.max);
    const high = Math.max(input.min, input.max);
    let scaled = value;
    if (value < low || value > high) {
        if (policy === OutOfRangePolicy.ERROR) {
            throw new AnalogConversionError(`linearScale : valeur ${value} hors de la plage d'entrée [${input.min}, ${input.max}]`,
                BoxErrorCode.ANALOG_VALUE_OUT_OF_RANGE, { value, min: input.min, max: input.max });
        }
        if (policy === OutOfRangePolicy.CLAMP) {
            scaled = Math.min(high, Math.max(low, value));
        }
    }
    // borne haute renvoyée telle quelle (outMin + (outMax - outMin) peut différer de outMax en virgule flottante)
    if (scaled === input.max) {
        return output.max;
    }
    return output.min + ((scaled - input.min) / (input.max - input.min)) * (output.max - output.min);
}
