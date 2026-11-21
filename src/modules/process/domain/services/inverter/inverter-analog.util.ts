import { AnalogSignalType } from '@process/domain/models/sensor.model';
import { InverterAnalogInput, InverterAnalogSensorModel, InverterModel } from '@process/domain/models/inverter.model';
import { OutOfRangePolicy, assertValidLinearRanges, linearScale } from '@process/domain/utils/linear-scale.util';
import { InverterProfile } from './profiles/inverter-profile.interface';

// courbe AI reportée : tension basse du capteur ↔ 0 %, tension haute ↔ 100 %
export const ANALOG_CURVE_LOW_PERCENT = 0;
export const ANALOG_CURVE_HIGH_PERCENT = 100;

// valeur physique par bloc de la courbe (unité de la saisie du set : V, %)
export type AnalogCurveValues = Record<string, number>;

/** Caractéristique exploitable : bornes finies, plage d'entrée non dégénérée ; sinon AnalogConversionError */
export const AssertAnalogSensor = (sensor: InverterAnalogSensorModel): void =>
    assertValidLinearRanges({ min: sensor.inputMin, max: sensor.inputMax }, { min: sensor.outputMin, max: sensor.outputMax });

/**
 * Valeurs de la courbe de l'entrée `input` reportant la caractéristique du capteur : bornes électriques en V
 * (mA × voltsPerMilliAmp pour un capteur en courant) ↔ 0 % / 100 %.
 */
export const AnalogCurveValuesOf = (profile: InverterProfile, input: InverterAnalogInput, sensor: InverterAnalogSensorModel): AnalogCurveValues => {
    const curve = profile.analogCurves[input];
    const toVolts = (value: number): number =>
        sensor.signalType === AnalogSignalType.CURRENT ? value * profile.voltsPerMilliAmp : value;
    return {
        [curve.lowVoltage]: toVolts(sensor.inputMin),
        [curve.lowPercent]: ANALOG_CURVE_LOW_PERCENT,
        [curve.highVoltage]: toVolts(sensor.inputMax),
        [curve.highPercent]: ANALOG_CURVE_HIGH_PERCENT
    };
};

/** Consigne dans l'unité du capteur -> consigne PID (%), bornée à la plage du capteur */
export const TargetToPercent = (sensor: InverterAnalogSensorModel, target: number): number =>
    linearScale(target, { min: sensor.outputMin, max: sensor.outputMax },
        { min: ANALOG_CURVE_LOW_PERCENT, max: ANALOG_CURVE_HIGH_PERCENT }, OutOfRangePolicy.CLAMP);

/** Entrée analogique choisie comme retour PID (valeur imposée du bloc source, sinon valeur d'usine) ; undefined : pas une entrée AI */
export const PidFeedbackInputOf = (profile: InverterProfile, inverter: Pick<InverterModel, 'parameters'>): InverterAnalogInput | undefined => {
    const imposed = inverter.parameters?.find((parameter) => parameter.blockId === profile.pidSource.blockId)?.value;
    return profile.pidSource.inputs[imposed ?? profile.pidSource.defaultValue];
};

/** Capteur du retour PID (caractéristique de l'entrée source) ; undefined si la source n'en a pas */
export const PidFeedbackSensorOf = (
    profile: InverterProfile, inverter: Pick<InverterModel, 'parameters' | 'analogInputs'>
): InverterAnalogSensorModel | undefined => {
    const input = PidFeedbackInputOf(profile, inverter);
    return input ? inverter.analogInputs?.[input] : undefined;
};
