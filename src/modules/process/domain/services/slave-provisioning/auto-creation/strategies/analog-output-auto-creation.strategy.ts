import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ActuatorModel, ActuatorType, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceKind, DeviceModel, SlaveConfigModel, SlaveTemplate } from '@process/domain/models/device.model';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CycleType } from '@process/domain/interfaces/executable.interface';
import { hasCommandType } from '@process/domain/utils/device-command.util';
import { DeviceCommandService } from '../../../device-command.service';
import { BuildModuleCycle } from '../builders/module-cycle.builder';
import { AutoCreatedElements, AutoCreationContext, AutoCreationStrategy } from '../auto-creation-strategy.interface';

// Module analog output : un actuator CTRL (vanne) par sortie, chacun piloté par son cycle PROPORTIONAL ;
// boucles de régulation non auto-créées
@Injectable()
export class AnalogOutputAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [DeviceKind.ANALOG_OUTPUT_8_CH, DeviceKind.ANALOG_OUTPUT_8_CH_MA];

    public constructor(
        private deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    public async build({ device, template }: AutoCreationContext): Promise<AutoCreatedElements> {
        const actuators = this._buildAnalogOutputActuators(device, template.kind, template.deviceCommands);
        const cycles = actuators.map((actuator) => BuildModuleCycle(device, actuator, CycleType.PROPORTIONAL));
        return { actuators, cycles, sensors: [] };
    }

    // Un actuator CTRL par port de sortie (portNumStart -> portNumStart + portCount - 1), piloté sur sa voie
    // par la commande set du modèle qui écrit la consigne numérique d'une voie
    private _buildAnalogOutputActuators(device: DeviceModel, kind: DeviceKind, deviceCommands: SlaveTemplate['deviceCommands']): ActuatorModel[] {
        const portConfig = (device.config as SlaveConfigModel).portConfig;
        if (!portConfig) return [];
        const outputCommand = deviceCommands.find((command) =>
            command._id && hasCommandType(command, DeviceCommandType.SET) && this.deviceCommandService.isAnalogOutputOf(kind, command));
        if (!outputCommand) {
            this.logger.warn({ deviceId: device._id }, 'no analog output command, analog output actuators not created');
            return [];
        }
        return Array.from({ length: portConfig.portCount }, (_, i) => {
            const portNumber = portConfig.portNumStart + i;
            const config = new CtrlActuatorConfigModel();
            config.deviceId = device._id;
            config.channel = portNumber;
            config.actions = [{ commandId: outputCommand._id, channel: portNumber }];
            return {
                _id: randomUUID(),
                status: ModuleStatus.OFF,
                name: `AO${portNumber}`,
                description: `Analog output channel ${portNumber}`,
                type: ActuatorType.CTRL,
                config,
                deletedAt: null
            };
        });
    }
}
