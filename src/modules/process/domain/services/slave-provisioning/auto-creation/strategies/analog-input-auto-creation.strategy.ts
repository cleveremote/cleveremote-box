import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceKind, DeviceModel, SlaveConfigModel, SlaveTemplate } from '@process/domain/models/device.model';
import { AnalogScalingModel, AnalogSensorConfigModel, AnalogSignalType, SensorModel } from '@process/domain/models/sensor.model';
import { hasCommandType, outcomeValues } from '@process/domain/utils/device-command.util';
import { OutOfRangePolicy } from '@process/domain/utils/linear-scale.util';
import { DeviceCommandService } from '../../../device-command.service';
import { AutoCreatedElements, AutoCreationContext, AutoCreationStrategy } from '../auto-creation-strategy.interface';
import { SENSOR_DEFAULT_CRON_PATTERN } from './sensor-auto-creation.strategy';

// Lecture des 8 voies (register map ANALOG_INPUT_8CH) : seule lecture portant l'unité de chaque voie (mV / µA / code via unitFrom),
// nécessaire à la conversion de la valeur brute en grandeur électrique
const INPUTS_BLOCK_ID = 'inputs';
const INPUTS_READ_OPERATION_ID = 'read';
// Type de plage de chaque voie (registre 0x1000 + voie, enum inputRange) : détermine l'unité renvoyée par la lecture (mV / µA / code)
const RANGES_BLOCK_ID = 'inputRanges';
const RANGES_READ_OPERATION_ID = 'read';

type ElectricalRange = Pick<AnalogScalingModel, 'signalType' | 'inputMin' | 'inputMax'>;

// Code de plage (enum inputRange) -> signal et bornes dans l'unité de base (V / mA / code). Codes 0 et 1 : bornes de la
// version (A) (0-5 V / 1-5 V) ; version (B) (0-10 V / 2-10 V) non détectable : à ajuster côté front
const RANGE_SCALINGS: Record<number, ElectricalRange> = {
    0: { signalType: AnalogSignalType.VOLTAGE, inputMin: 0, inputMax: 5 },
    1: { signalType: AnalogSignalType.VOLTAGE, inputMin: 1, inputMax: 5 },
    2: { signalType: AnalogSignalType.CURRENT, inputMin: 0, inputMax: 20 },
    3: { signalType: AnalogSignalType.CURRENT, inputMin: 4, inputMax: 20 },
    4: { signalType: AnalogSignalType.RAW, inputMin: 0, inputMax: 4095 },
};
// Plage de voie illisible (module injoignable) ou inconnue
const DEFAULT_RANGE = RANGE_SCALINGS[3];

type TemplateCommand = SlaveTemplate['deviceCommands'][number];

// Module analog input : un sensor ANALOG indépendant (sans parent, lu sur son propre cron) par entrée, mis à l'échelle
// selon le type de plage configuré sur la voie (lu sur le module) -> 0-100 % (à ajuster côté front selon le capteur raccordé)
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
        const ranges = await this._readChannelRanges(device);
        return { actuators: [], cycles: [], sensors: this._buildAnalogInputSensors(device, deviceCommands, ranges) };
    }

    // Code de plage de chaque voie (index 0-based) lu sur le module ; échec : liste vide (plage par défaut, warn)
    private async _readChannelRanges(device: DeviceModel): Promise<number[]> {
        try {
            const outcome = await this.deviceCommandService.executeOnSlave(device,
                { blockId: RANGES_BLOCK_ID, operationId: RANGES_READ_OPERATION_ID });
            return outcomeValues(outcome).map(({ value }) => value);
        } catch (err) {
            this.logger.warn({ deviceId: device._id, err: err.message }, 'analog input ranges unreadable, default 4-20 mA scaling applied');
            return [];
        }
    }

    // Un sensor par port d'entrée (portNumStart -> portNumStart + portCount - 1), retenant le champ de sa voie dans la lecture des 8 voies
    private _buildAnalogInputSensors(device: DeviceModel, deviceCommands: TemplateCommand[], ranges: number[]): SensorModel[] {
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
            .map((field, i) => field && this._buildSensor(device, readCommand._id, field.name, portConfig.portNumStart + i, ranges[i]))
            .filter((sensor): sensor is SensorModel => !!sensor);
    }

    private _buildSensor(device: DeviceModel, commandId: string, field: string, portNumber: number, rangeCode?: number): SensorModel {
        const config = new AnalogSensorConfigModel();
        config.commandId = commandId;
        config.deviceId = device._id;
        config.field = field;
        config.cronPattern = SENSOR_DEFAULT_CRON_PATTERN;
        config.scaling = this._scaling(rangeCode);
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

    private _scaling(rangeCode?: number): AnalogScalingModel {
        return Object.assign(new AnalogScalingModel(), {
            ...(RANGE_SCALINGS[rangeCode] ?? DEFAULT_RANGE),
            outputMin: 0,
            outputMax: 100,
            unit: '%',
            outOfRange: OutOfRangePolicy.CLAMP
        });
    }
}
