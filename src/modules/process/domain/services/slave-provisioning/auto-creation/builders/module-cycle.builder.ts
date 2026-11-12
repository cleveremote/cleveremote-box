import { randomUUID } from 'node:crypto';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { DeviceModel } from '@process/domain/models/device.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { CycleType } from '@process/domain/interfaces/executable.interface';

// borne d'un ON manuel sur un cycle MODULE auto-créé (1 h)
export const MODULE_SEQUENCE_MAX_DURATION = 3_600_000;

// Un cycle par actuator (MODULE par défaut, PROPORTIONAL pour une vanne CTRL), d'une seule séquence qui le
// référence : il pilote l'actuator seul
export function BuildModuleCycle(device: DeviceModel, actuator: ActuatorModel, type: CycleType = CycleType.MODULE): CycleModel {
    const cycle = new CycleModel();
    cycle._id = randomUUID();
    cycle.name = `${device.name} ${actuator.name}`;
    cycle.description = `${device.name} ${actuator.name}`;
    cycle.type = type;
    cycle.autoCreated = true;
    cycle.style = { bgColor: '#ffffff', fontColor: '#000000', iconColor: { icon: 'module', base: '#000000' } };

    const sequence = new SequenceModel();
    sequence._id = randomUUID();
    sequence.cycleId = cycle._id;
    sequence.name = actuator.name;
    sequence.description = `${device.name} ${actuator.name}`;
    sequence.order = 0;
    sequence.securityConfig = { maxDuration: MODULE_SEQUENCE_MAX_DURATION };
    sequence.moduleConfigs = [{
        moduleId: actuator._id,
        configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
    }];
    cycle.sequences = [sequence];
    return cycle;
}
