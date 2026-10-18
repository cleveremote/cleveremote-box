import { ComRequestModel } from './com-request.model';
import { SensorType } from '../interfaces/sensor.interface';

export enum MasterProtocol {
    TCP = 'TCP',
    RTU = 'RTU',
}

export enum DeviceType {
    MASTER = 'MASTER',
    SLAVE = 'SLAVE',
}

export enum DeviceKind {
    ANALOG_OUTPUT_8_CH = 'ANALOG_OUTPUT_8CH',
    ANALOG_INPUT_8_CH = 'DIGITAL_IO_8CH',
    DIGITAL_IO_8_CH = 'DIGITAL_IO_8CH',
    MODBUS_SLAVE = 'MODBUS_SLAVE',
    INVERTER_VEICHI_SI23_V1 = 'INVERTER_VEICHI_SI23_V1',
    INVERTER = 'INVERTER',
    //SENSORS
    FLOWMETER_ULTRASONIC_V1 = 'FLOWMETER_ULTRASONIC',
    FLOWMETER_V1 = 'FLOWMETER_V1',
    PRESSURE_V1 = 'PRESSURE_V1',
    EC_METER_V1 = 'EC_METER_V1',
    TEMPERATURE_MOISTURE_V1 = 'TEMPERATURE_MOISTURE_V1',
    UNKNOWN_DEVICE = 'UNKNOWN_DEVICE',
}

export enum DeviceRangeType {
    INVERTER = 'INVERTER',
    FLOWMETER = 'FLOWMETER',
    PRESSURE = 'PRESSURE',
    EC_METER = 'EC_METER',
    FLOWMETER_ULTRASONIC = 'FLOWMETER_ULTRASONIC',
    TEMPERATURE_MOISTURE = 'TEMPERATURE_MOISTURE',
    DIGITAL_IO = 'DIGITAL_IO',
    ANALOG_OUTPUT = 'ANALOG_OUTPUT',
    ANALOG_INPUT = 'ANALOG_INPUT',
    OTHERS = 'OTHERS',
}

// Registre Modbus sondé pour identifier le type d'un slave lors de la découverte
export enum DiscoveryAddressRegister {
    PRESSURE = 0x0000,
    FLOWMETER = 0x0005,
    INVERTER = 0x0D01,
    EC_TMP_MOISTURE_METER = 0x07D0,
    FLOWMETER_ULTRASONIC = 0x003D,
    DIGITAL_IO = 0x4000,
    ANALOG_OUTPUT = 0x4000,
    ANALOG_INPUT = 0x4000,
}

// Registre de découverte de chaque type (OTHERS n'est pas découvrable)
export const DISCOVERY_REGISTER_BY_TYPE: Partial<Record<DeviceRangeType, DiscoveryAddressRegister>> = {
    [DeviceRangeType.INVERTER]: DiscoveryAddressRegister.INVERTER,
    [DeviceRangeType.FLOWMETER]: DiscoveryAddressRegister.FLOWMETER,
    [DeviceRangeType.PRESSURE]: DiscoveryAddressRegister.PRESSURE,
    [DeviceRangeType.EC_METER]: DiscoveryAddressRegister.EC_TMP_MOISTURE_METER,
    [DeviceRangeType.FLOWMETER_ULTRASONIC]: DiscoveryAddressRegister.FLOWMETER_ULTRASONIC,
    [DeviceRangeType.TEMPERATURE_MOISTURE]: DiscoveryAddressRegister.EC_TMP_MOISTURE_METER,
    [DeviceRangeType.DIGITAL_IO]: DiscoveryAddressRegister.DIGITAL_IO,
    [DeviceRangeType.ANALOG_OUTPUT]: DiscoveryAddressRegister.ANALOG_OUTPUT,
    [DeviceRangeType.ANALOG_INPUT]: DiscoveryAddressRegister.ANALOG_INPUT,
};

// Plage [min, max] (bornes incluses) associée à chaque type : TYPE_n couvre (n-1)*10+1 -> n*10
export const DEVICE_RANGE_TYPE_RANGES: Record<DeviceRangeType, { min: number; max: number }> = {
    [DeviceRangeType.INVERTER]: { min: 1, max: 10 },
    [DeviceRangeType.FLOWMETER]: { min: 11, max: 20 },
    [DeviceRangeType.PRESSURE]: { min: 21, max: 30 },
    [DeviceRangeType.EC_METER]: { min: 31, max: 40 },
    [DeviceRangeType.FLOWMETER_ULTRASONIC]: { min: 41, max: 50 },
    [DeviceRangeType.TEMPERATURE_MOISTURE]: { min: 51, max: 60 },
    [DeviceRangeType.DIGITAL_IO]: { min: 61, max: 70 },
    [DeviceRangeType.ANALOG_OUTPUT]: { min: 71, max: 80 },
    [DeviceRangeType.ANALOG_INPUT]: { min: 81, max: 90 },
    [DeviceRangeType.OTHERS]: { min: 91, max: 100 },
};

export function getDeviceRangeType(value: number): DeviceRangeType | undefined {
    return (Object.keys(DEVICE_RANGE_TYPE_RANGES) as DeviceRangeType[])
        .find((type) => value >= DEVICE_RANGE_TYPE_RANGES[type].min && value <= DEVICE_RANGE_TYPE_RANGES[type].max);
}

export class MasterConfigModel {
    public protocol: MasterProtocol;
    public ipAddress?: string;
    // Identifiant matériel Waveshare (cf. WaveshareDiscoveryService) : permet de retrouver
    // l'IP du master quand elle change (DHCP).
    public deviceId?: string;
    public port?: number;
    public baudRate?: number;
    public path?: string;
    public timeout?: number;
    // Registres à sonder (unit id DEFAULT_UNCONFIGURED_UNIT_ID) pour détecter un nouveau slave
    // non configuré : vide/absent = découverte désactivée pour ce Master.
    public discoveryRegisters?: number[];
}

export class SlaveConfigModel {
    public slaveId: number;
    public masterDeviceId?: string;
    // Stratégie de pilotage du slave (absent = esclave Modbus générique)
    public kind?: DeviceKind;
    // Configuration des ports de l'équipement (absent = non défini)
    public portConfig?: PortConfigModel;
}

export class PortConfigModel {
    public portNumStart: number;
    public portCount: number;
}

export class DeviceModel {
    public _id: string;
    public name: string;
    public type: DeviceType;
    public description: string;
    public config: MasterConfigModel | SlaveConfigModel;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}

// Template d'un SLAVE et de ses comRequests, sans ids ni timestamps, pour le recréer sous un master
export interface SlaveTemplate {
    _id: string;
    name: string;
    description?: string;
    type: DeviceRangeType;
    device: Pick<DeviceModel, 'name' | 'description'> & Pick<SlaveConfigModel, 'kind' | 'portConfig'>;
    comRequests: Omit<ComRequestModel, '_id' | 'deviceId' | 'createdAt' | 'updatedAt' | 'deletedAt'>[];
}
