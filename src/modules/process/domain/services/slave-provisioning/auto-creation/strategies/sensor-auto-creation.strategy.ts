import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DeviceKind } from '@process/domain/models/device.model';
import { DeviceCommandService } from '../../../device-command.service';
import { AutoCreatedElements, AutoCreationContext, AutoCreationStrategy } from '../auto-creation-strategy.interface';
import { BuildCommandSensors } from '../builders/command-sensor.builder';

export { SENSOR_DEFAULT_CRON_PATTERN } from '../builders/command-sensor.builder';

// Capteurs Modbus : par lecture du modèle portant des champs autoCreate (type sensor), un sensor parent (lu sur son cron)
// et un sensor enfant par champ ; une spécialisation par kind se fait en sortant ce kind vers sa propre stratégie
@Injectable()
export class SensorAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [
        DeviceKind.FLOWMETER_V1,
        DeviceKind.PRESSURE_V1,
        DeviceKind.EC_METER_V1,
        DeviceKind.FLOWMETER_ULTRASONIC_V1,
        DeviceKind.TEMPERATURE_MOISTURE_V1
    ];

    public constructor(
        private deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    // params recalculés depuis la register map : ceux persistés peuvent dater d'avant un autoCreate ajouté au template JSON
    public async build({ device, template }: AutoCreationContext): Promise<AutoCreatedElements> {
        const { deviceCommands } = this.deviceCommandService.withTemplateParams(template);
        // nom de commande enregistré dans la langue du seed : traduit dans celle de la box
        const sensors = deviceCommands.flatMap((command) =>
            BuildCommandSensors(device, command, this.deviceCommandService.localizeCommandName(template.kind, command)));
        if (!sensors.length) {
            this.logger.warn({ deviceId: device._id, kind: template.kind }, 'no autoCreate read field, sensors not created');
        }
        return { actuators: [], cycles: [], sensors };
    }
}
