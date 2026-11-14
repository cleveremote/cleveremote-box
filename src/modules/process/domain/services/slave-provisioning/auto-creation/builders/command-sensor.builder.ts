import { randomUUID } from 'node:crypto';
import { AutoCreateType, ResultFieldParam } from '@register-map/domain/models/register-map.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceModel, SlaveTemplate } from '@process/domain/models/device.model';
import { ComSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { hasCommandType } from '@process/domain/utils/device-command.util';

// rythme de lecture du sensor parent auto-créé (toutes les 30 s)
export const SENSOR_DEFAULT_CRON_PATTERN = '*/30 * * * * *';

export type TemplateCommand = SlaveTemplate['deviceCommands'][number];

// Champ autoCreate de l'usage `type` (sans autoCreateType : sensor)
export const IsAutoCreateField = (field: ResultFieldParam, type: AutoCreateType): boolean =>
    !!field.autoCreate && (field.autoCreateType ?? AutoCreateType.SENSOR) === type;

// Champs autoCreate de l'usage `type` d'une commande de lecture à champs, retenus par la commande (fields absent = tous)
export const AutoCreateFields = (command: TemplateCommand, type: AutoCreateType): ResultFieldParam[] => {
    const result = command.params?.result;
    if (!command._id || !hasCommandType(command, DeviceCommandType.READ) || result?.type !== 'fields') return [];
    return result.fields.filter((field) => IsAutoCreateField(field, type) && (!command.fields?.length || command.fields.includes(field.name)));
};

/**
 * Sensors d'une lecture : un parent (lu sur son cron) et un enfant par champ autoCreate de type sensor.
 * `commandName` : nom de la commande dans la langue de la box. Aucun champ : aucun sensor.
 */
export const BuildCommandSensors = (device: DeviceModel, command: TemplateCommand, commandName: string,
    cronPattern: string = SENSOR_DEFAULT_CRON_PATTERN): SensorModel[] => {
    const fields = AutoCreateFields(command, AutoCreateType.SENSOR);
    if (!fields.length) return [];

    const parentConfig = new ComSensorConfigModel();
    parentConfig.commandId = command._id;
    parentConfig.deviceId = device._id;
    parentConfig.cronPattern = cronPattern;
    const parent = BuildSensor(`${device.name} ${commandName}`, parentConfig, { display: true });
    return [parent, ...fields.map((field) => BuildChildSensor(device, parent, field))];
};

const BuildChildSensor = (device: DeviceModel, parent: SensorModel, field: ResultFieldParam): SensorModel => {
    const config = new ComSensorConfigModel();
    config.field = field.name;
    const name = `${device.name} ${field.label}`;
    return BuildSensor(name, config, { parentId: parent._id, description: field.description ?? name });
};

const BuildSensor = (name: string, config: ComSensorConfigModel, overrides: Partial<SensorModel>): SensorModel =>
    Object.assign(new SensorModel(), {
        _id: randomUUID(),
        name,
        description: name,
        type: SensorType.COM,
        style: { bgColor: '#ffffff', fontColor: '#000000', iconColor: { icon: 'sensor', base: '#000000' } },
        config,
        autoCreated: true,
        ...overrides
    });
