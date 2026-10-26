import { ActuatorModel } from '@process/domain/models/actuator.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { DeviceKind, DeviceModel, SlaveTemplate } from '@process/domain/models/device.model';
import { SensorModel } from '@process/domain/models/sensor.model';

export const AUTO_CREATION_STRATEGIES = 'AUTO_CREATION_STRATEGIES';

// Slave construit à partir d'un template, avec les éléments qui lui sont rattachés
export type SlaveBundle = { device: DeviceModel; actuators: ActuatorModel[]; cycles: CycleModel[]; sensors: SensorModel[] };

// Éléments rattachés produits par une stratégie (le device est construit par AutoCreationService)
export type AutoCreatedElements = Omit<SlaveBundle, 'device'>;

export interface AutoCreationContext {
    // slave déjà construit (id, nom unique, config), pas encore persisté
    device: DeviceModel;
    template: SlaveTemplate;
}

export interface AutoCreationStrategy {
    // kinds pris en charge : une famille (ex: analog output 0-10V + mA) ou un seul kind (spécialisation)
    readonly kinds: DeviceKind[];
    build(context: AutoCreationContext): Promise<AutoCreatedElements>;
}
