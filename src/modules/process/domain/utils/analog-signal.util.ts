import { AnalogConversionError } from '../errors/analog-conversion.error';
import { BoxErrorCode } from '@framework/errors/box-error';
import { AnalogScalingModel, AnalogSignalType } from '../models/sensor.model';
import { linearScale } from './linear-scale.util';

// Diviseur de chaque unité lue vers l'unité de base du signal (V, mA) : division plutôt que × 0.001 (précision)
const ELECTRICAL_UNIT_DIVISORS: Record<Exclude<AnalogSignalType, AnalogSignalType.RAW>, Record<string, number>> = {
    [AnalogSignalType.VOLTAGE]: { V: 1, mV: 1000 },
    [AnalogSignalType.CURRENT]: { A: 0.001, mA: 1, µA: 1000, uA: 1000 },
};

/**
 * Valeur brute lue (dans l'unité `unit` renvoyée par l'acquisition, ex: mV / µA de la register map) exprimée dans l'unité de base
 * du signal : V (VOLTAGE), mA (CURRENT) ; RAW : inchangée. Unité absente : valeur supposée déjà dans l'unité de base.
 * Unité incompatible avec le signal (ex: capteur CURRENT sur une voie configurée en tension) : AnalogConversionError.
 */
export function toElectricalValue(value: number, unit: string | undefined, signalType: AnalogSignalType): number {
    if (signalType === AnalogSignalType.RAW || !unit) {
        return value;
    }
    const divisors = ELECTRICAL_UNIT_DIVISORS[signalType];
    if (!divisors) {
        throw new AnalogConversionError(`toElectricalValue : type de signal inconnu "${signalType}"`,
            BoxErrorCode.ANALOG_SIGNAL_UNKNOWN, { signalType });
    }
    const divisor = divisors[unit];
    if (divisor === undefined) {
        throw new AnalogConversionError(`toElectricalValue : unité "${unit}" incompatible avec un signal ${signalType} (attendu : ${Object.keys(divisors).join(', ')})`,
            BoxErrorCode.ANALOG_UNIT_INCOMPATIBLE, { unit, signalType, allowed: Object.keys(divisors) });
    }
    return divisor === 1 ? value : value / divisor;
}

/** Valeur brute lue -> grandeur physique (scaling.unit) : conversion électrique puis mise à l'échelle linéaire */
export function toPhysicalValue(value: number, unit: string | undefined, scaling: AnalogScalingModel,isFromLoopCtrl?:boolean): number {
    if (!scaling) {
        throw new AnalogConversionError('toPhysicalValue : mise à l\'échelle absente', BoxErrorCode.ANALOG_SCALING_MISSING);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AnalogConversionError(`toPhysicalValue : valeur non numérique (${value})`,
            BoxErrorCode.ANALOG_VALUE_NOT_NUMERIC, { value: String(value) });
    }
    if(isFromLoopCtrl){
        return  toElectricalValue(value, unit, AnalogSignalType.RAW);
    }
    return linearScale(
        toElectricalValue(value, unit, scaling.signalType),
        { min: scaling.inputMin, max: scaling.inputMax },
        { min: scaling.outputMin, max: scaling.outputMax },
        scaling.outOfRange
    );
}
