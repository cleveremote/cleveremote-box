import { DeviceKind } from '@process/domain/models/device.model';
import { SimulationBehavior, SimulationBehaviorFactory } from './behavior.interface';
import { DigitalIoBehavior } from './digital-io.behavior';
import { InverterBehavior } from './inverter.behavior';
import { MeasurementBehavior } from './measurement.behavior';
import { MEASUREMENT_PROFILES } from './measurement-profiles';

// Behaviors dédiés ; les kinds avec un profil de mesure ont un MeasurementBehavior
const DEDICATED_BEHAVIORS: Partial<Record<string, SimulationBehaviorFactory>> = {
    [DeviceKind.INVERTER_VEICHI_SI23_V1]: () => new InverterBehavior(),
    [DeviceKind.DIGITAL_IO_8_CH]: () => new DigitalIoBehavior()
};

/** Nouveau behavior pour un équipement de ce kind ; undefined = banque de registres seule (ex: sorties analogiques) */
export function CreateSimulationBehavior(kind: string): SimulationBehavior | undefined {
    const dedicated = DEDICATED_BEHAVIORS[kind];
    if (dedicated) {
        return dedicated();
    }
    const profile = MEASUREMENT_PROFILES[kind];
    return profile ? new MeasurementBehavior(profile) : undefined;
}
