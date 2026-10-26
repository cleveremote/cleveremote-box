import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ResultFieldParam } from '@register-map/domain/models/register-map.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceKind, DeviceModel, SlaveTemplate } from '@process/domain/models/device.model';
import { ComSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { hasCommandType } from '@process/domain/utils/device-command.util';
import { DeviceCommandService } from '../../../device-command.service';
import { AutoCreatedElements, AutoCreationContext, AutoCreationStrategy } from '../auto-creation-strategy.interface';

// rythme de lecture du sensor parent auto-créé (toutes les 30 s)
export const SENSOR_DEFAULT_CRON_PATTERN = '*/30 * * * * *';

type TemplateCommand = SlaveTemplate['deviceCommands'][number];

// Capteurs Modbus : par lecture du modèle portant des champs autoCreate, un sensor parent (lu sur son cron) et un
// sensor enfant par champ ; une spécialisation par kind se fait en sortant ce kind vers sa propre stratégie
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
        const sensors = deviceCommands.flatMap((command) => this._buildCommandSensors(device, command));
        if (!sensors.length) {
            this.logger.warn({ deviceId: device._id, kind: template.kind }, 'no autoCreate read field, sensors not created');
        }
        return { actuators: [], cycles: [], sensors };
    }

    // Lecture du modèle : parent + un enfant par champ autoCreate retenu par la commande (fields absent = tous)
    private _buildCommandSensors(device: DeviceModel, command: TemplateCommand): SensorModel[] {
        const result = command.params?.result;
        if (!command._id || !hasCommandType(command, DeviceCommandType.READ) || result?.type !== 'fields') return [];
        const fields = result.fields.filter((field) => field.autoCreate && (!command.fields?.length || command.fields.includes(field.name)));
        if (!fields.length) return [];

        const parentConfig = new ComSensorConfigModel();
        parentConfig.commandId = command._id;
        parentConfig.deviceId = device._id;
        parentConfig.cronPattern = SENSOR_DEFAULT_CRON_PATTERN;
        // valeurs portées par les enfants : le parent n'est pas affiché
        const parent = this._buildSensor(`${device.name} ${command.name}`, parentConfig, { display: false });
        return [parent, ...fields.map((field) => this._buildChildSensor(device, parent, field))];
    }

    private _buildChildSensor(device: DeviceModel, parent: SensorModel, field: ResultFieldParam): SensorModel {
        const config = new ComSensorConfigModel();
        config.field = field.name;
        const name = `${device.name} ${field.label}`;
        return this._buildSensor(name, config, { parentId: parent._id, description: field.description ?? name });
    }

    private _buildSensor(name: string, config: ComSensorConfigModel, overrides: Partial<SensorModel>): SensorModel {
        return Object.assign(new SensorModel(), {
            _id: randomUUID(),
            name,
            description: name,
            type: SensorType.COM,
            style: { bgColor: '#ffffff', fontColor: '#000000', iconColor: { icon: 'sensor', base: '#000000' } },
            config,
            ...overrides
        });
    }
}
