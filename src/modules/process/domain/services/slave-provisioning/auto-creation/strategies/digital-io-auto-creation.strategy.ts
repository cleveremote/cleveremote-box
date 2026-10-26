import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ActuatorModel, ActuatorType, ComActuatorConfigModel } from '@process/domain/models/actuator.model';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceKind, DeviceModel, SlaveConfigModel, SlaveTemplate } from '@process/domain/models/device.model';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { hasCommandType } from '@process/domain/utils/device-command.util';
import { DeviceCommandService } from '../../../device-command.service';
import { BuildModuleCycle } from '../builders/module-cycle.builder';
import { AutoCreatedElements, AutoCreationContext, AutoCreationStrategy } from '../auto-creation-strategy.interface';

// Module IO digital : un actuator COM par sortie, chacun piloté par son cycle MODULE
@Injectable()
export class DigitalIoAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [DeviceKind.DIGITAL_IO_8_CH];

    public constructor(
        private deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    public async build({ device, template }: AutoCreationContext): Promise<AutoCreatedElements> {
        const actuators = this._buildDigitalOutputActuators(device, template.kind, template.deviceCommands);
        const cycles = actuators.map((actuator) => BuildModuleCycle(device, actuator));
        return { actuators, cycles };
    }

    // Un actuator COM par port de sortie (portNumStart -> portNumStart + portCount - 1), piloté sur sa voie
    // par la commande set du modèle qui vise un bloc de coils
    private _buildDigitalOutputActuators(device: DeviceModel, kind: DeviceKind, deviceCommands: SlaveTemplate['deviceCommands']): ActuatorModel[] {
        const portConfig = (device.config as SlaveConfigModel).portConfig;
        if (!portConfig) return [];
        const outputCommand = deviceCommands.find((command) =>
            command._id && hasCommandType(command, DeviceCommandType.SET) && this.deviceCommandService.isDigitalOutputOf(kind, command));
        if (!outputCommand) {
            this.logger.warn({ deviceId: device._id }, 'no digital output command, digital output actuators not created');
            return [];
        }
        return Array.from({ length: portConfig.portCount }, (_, i) => {
            const portNumber = portConfig.portNumStart + i;
            const config = new ComActuatorConfigModel();
            config.deviceId = device._id;
            config.actions = [{ commandId: outputCommand._id, channel: portNumber }];
            return {
                _id: randomUUID(),
                status: ModuleStatus.OFF,
                name: `DO${portNumber}`,
                type: ActuatorType.COM,
                config,
                deletedAt: null
            };
        });
    }
}
