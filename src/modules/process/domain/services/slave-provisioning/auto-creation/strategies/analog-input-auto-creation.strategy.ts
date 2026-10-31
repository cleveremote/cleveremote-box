import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceKind, DeviceModel, SlaveConfigModel, SlaveTemplate } from '@process/domain/models/device.model';
import { AnalogScalingModel, AnalogSensorConfigModel, AnalogSignalType, SensorModel } from '@process/domain/models/sensor.model';
import { hasCommandType } from '@process/domain/utils/device-command.util';
import { OutOfRangePolicy } from '@process/domain/utils/linear-scale.util';
import { DeviceCommandService } from '../../../device-command.service';
import { AutoCreatedElements, AutoCreationContext, AutoCreationStrategy } from '../auto-creation-strategy.interface';
import { SENSOR_DEFAULT_CRON_PATTERN } from './sensor-auto-creation.strategy';

// Lecture des 8 voies (register map ANALOG_INPUT_8CH) : seule lecture portant l'unité de chaque voie (mV / µA / code via unitFrom),
// nécessaire à la conversion de la valeur brute en grandeur électrique
const INPUTS_BLOCK_ID = 'inputs';
const INPUTS_READ_OPERATION_ID = 'read';

type TemplateCommand = SlaveTemplate['deviceCommands'][number];

// Module analog input : un sensor ANALOG indépendant (sans parent, lu sur son propre cron) par entrée, mis à l'échelle
// par défaut en 4-20 mA -> 0-100 % (à ajuster côté front selon le capteur raccordé)
@Injectable()
export class AnalogInputAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [DeviceKind.ANALOG_INPUT_8_CH];

    public constructor(
        private deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    // params recalculés depuis la register map (champs de la lecture : un par voie)
    public async build({ device, template }: AutoCreationContext): Promise<AutoCreatedElements> {
        const { deviceCommands } = this.deviceCommandService.withTemplateParams(template);
        return { actuators: [], cycles: [], sensors: this._buildAnalogInputSensors(device, deviceCommands) };
    }

    // Un sensor par port d'entrée (portNumStart -> portNumStart + portCount - 1), retenant le champ de sa voie dans la lecture des 8 voies
    private _buildAnalogInputSensors(device: DeviceModel, deviceCommands: TemplateCommand[]): SensorModel[] {
        const portConfig = (device.config as SlaveConfigModel).portConfig;
        if (!portConfig) return [];
        const readCommand = deviceCommands.find((command) => command._id && hasCommandType(command, DeviceCommandType.READ)
            && command.blockId === INPUTS_BLOCK_ID && command.operationId === INPUTS_READ_OPERATION_ID);
        const result = readCommand?.params?.result;
        if (!readCommand || result?.type !== 'fields') {
            this.logger.warn({ deviceId: device._id }, 'no analog input read command, analog input sensors not created');
            return [];
        }
        return Array.from({ length: portConfig.portCount }, (_, i) => result.fields[i])
            .map((field, i) => field && this._buildSensor(device, readCommand._id, field.name, portConfig.portNumStart + i))
            .filter((sensor): sensor is SensorModel => !!sensor);
    }

    private _buildSensor(device: DeviceModel, commandId: string, field: string, portNumber: number): SensorModel {
        const config = new AnalogSensorConfigModel();
        config.commandId = commandId;
        config.deviceId = device._id;
        config.field = field;
        config.cronPattern = SENSOR_DEFAULT_CRON_PATTERN;
        config.scaling = this._defaultScaling();
        const name = `AI${portNumber}`;
        return Object.assign(new SensorModel(), {
            _id: randomUUID(),
            name,
            description: `${device.name} ${name}`,
            type: SensorType.ANALOG,
            style: { bgColor: '#ffffff', fontColor: '#000000', iconColor: { icon: 'sensor', base: '#000000' } },
            config
        });
    }

    private _defaultScaling(): AnalogScalingModel {
        return Object.assign(new AnalogScalingModel(), {
            signalType: AnalogSignalType.CURRENT,
            inputMin: 4,
            inputMax: 20,
            outputMin: 0,
            outputMax: 100,
            unit: '%',
            outOfRange: OutOfRangePolicy.CLAMP
        });
    }
}
