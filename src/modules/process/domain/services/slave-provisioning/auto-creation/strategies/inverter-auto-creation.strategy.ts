import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AutoCreateType } from '@register-map/domain/models/register-map.model';
import { ComSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { DeviceKind, DeviceModel } from '@process/domain/models/device.model';
import { InverterMode, InverterModel, InverterParameterModel, InverterRole } from '@process/domain/models/inverter.model';
import { DeviceCommandService } from '../../../device-command.service';
import { InverterProfile } from '../../../inverter/profiles/inverter-profile.interface';
import { ResolveInverterProfile } from '../../../inverter/profiles/inverter-profile.resolver';
import { AutoCreatedElements, AutoCreationContext, AutoCreationStrategy } from '../auto-creation-strategy.interface';
import { AutoCreateFields, BuildCommandSensors, TemplateCommand } from '../builders/command-sensor.builder';

// monitoring du variateur lu toutes les 5 s : détection du manuel (entrées X) et entretien de la liaison (F13.06)
export const INVERTER_MONITORING_CRON_PATTERN = '*/5 * * * * *';

/**
 * Variateur : depuis les champs autoCreate de sa register map,
 * - type sensor : sensors du monitoring (parent lu sur cron + un enfant par champ), dont l'état des entrées X ;
 * - type inverter : paramètres embarqués par l'élément INVERTER (commandes read/set, valeur imposée par le profil).
 * L'élément INVERTER est piloté par les directives des séquences (InverterControlService).
 */
@Injectable()
export class InverterAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [DeviceKind.INVERTER_VEICHI_SI23_V1];

    public constructor(
        private deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    public async build({ device, template }: AutoCreationContext): Promise<AutoCreatedElements> {
        const profile = ResolveInverterProfile(template.kind);
        const { deviceCommands } = this.deviceCommandService.withTemplateParams(template);
        const sensors = deviceCommands.flatMap((command) => BuildCommandSensors(device, command,
            this.deviceCommandService.localizeCommandName(template.kind, command), INVERTER_MONITORING_CRON_PATTERN));
        if (!profile) {
            this.logger.warn({ deviceId: device._id, kind: template.kind }, 'no inverter profile, inverter element not created');
            return { actuators: [], cycles: [], sensors };
        }
        const inverter = this._buildInverter(device, profile, deviceCommands, sensors);
        return { actuators: [], cycles: [], sensors, inverters: [inverter] };
    }

    private _buildInverter(device: DeviceModel, profile: InverterProfile, commands: TemplateCommand[], sensors: SensorModel[]): InverterModel {
        const inverter = new InverterModel();
        inverter._id = randomUUID();
        inverter.name = device.name;
        inverter.description = device.description;
        inverter.deviceId = device._id;
        inverter.profile = profile.kind;
        inverter.defaultMode = InverterMode.PID;
        inverter.commands = this._roleCommands(device, profile, commands);
        inverter.parameters = this._parameters(profile, commands);
        inverter.manualSensorId = sensors.find((sensor) => (sensor.config as ComSensorConfigModel).field === profile.inputsField)?._id;
        if (!inverter.manualSensorId) {
            this.logger.warn({ deviceId: device._id, field: profile.inputsField }, 'inverter inputs field not autoCreated, manual mode not detected');
        }
        const missing = Object.keys(profile.baseline).filter((blockId) => !inverter.parameters.some((parameter) => parameter.blockId === blockId));
        if (missing.length) {
            this.logger.warn({ deviceId: device._id, missing }, 'inverter baseline parameters not flagged autoCreateType=inverter, ignored');
        }
        return inverter;
    }

    private _roleCommands(device: DeviceModel, profile: InverterProfile, commands: TemplateCommand[]): InverterModel['commands'] {
        const roleCommands: InverterModel['commands'] = {};
        for (const role of Object.values(InverterRole)) {
            const ref = profile.roles[role];
            const command = commands.find((c) => c.blockId === ref.blockId && c.operationId === ref.operationId);
            if (command?._id) {
                roleCommands[role] = command._id;
            } else {
                this.logger.warn({ deviceId: device._id, role, ...ref }, 'inverter role command not found');
            }
        }
        return roleCommands;
    }

    // un paramètre par champ autoCreateType=inverter dont le bloc a une opération set
    private _parameters(profile: InverterProfile, commands: TemplateCommand[]): InverterParameterModel[] {
        return commands.flatMap((read) => AutoCreateFields(read, AutoCreateType.INVERTER).flatMap((field) => {
            const set = commands.find((c) => c.blockId === read.blockId && c.operationId === 'set');
            if (!set?._id) return [];
            return [Object.assign(new InverterParameterModel(), {
                blockId: read.blockId,
                field: field.name,
                readCommandId: read._id,
                setCommandId: set._id,
                ...(profile.baseline[read.blockId] !== undefined && { value: profile.baseline[read.blockId] }),
                isPersistent: true
            })];
        }));
    }
}
