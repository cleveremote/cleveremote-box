import { DeviceCommandModel } from './device-command.model';
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
    INVERTER_VEICHI_SI23_V1 = 'INVERTER_VEICHI_SI23_V1',
    //SENSORS
    FLOWMETER_V1 = 'FLOWMETER_V1',
    PRESSURE_V1 = 'PRESSURE_V1',
    EC_METER_V1 = 'EC_METER_V1',
    FLOWMETER_ULTRASONIC_V1 = 'FLOWMETER_ULTRASONIC_V1',
    TEMPERATURE_MOISTURE_V1 = 'TEMPERATURE_MOISTURE_V1',
    //IO MODULES
    DIGITAL_IO_8_CH = 'DIGITAL_IO_8CH',
    ANALOG_OUTPUT_8_CH = 'ANALOG_OUTPUT_8CH',
    ANALOG_INPUT_8_CH = 'ANALOG_INPUT_8CH',
    // Esclave Modbus générique (ex-OTHERS)
    MODBUS_SLAVE = 'MODBUS_SLAVE',
    UNKNOWN_DEVICE = 'UNKNOWN_DEVICE',
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

// Plage [min, max] d'unit ids (bornes incluses)
export interface AddressRange {
    min: number;
    max: number;
}

export interface DeviceKindSpec {
    range: AddressRange;
    // Absent = kind non découvrable
    discoveryRegister?: DiscoveryAddressRegister;
}

// Spécification de chaque kind : plage d'adresses + registre de découverte.
// Record complet : tout nouveau DeviceKind doit être déclaré ici (undefined = sans plage).
export const DEVICE_KIND_SPECS: Record<DeviceKind, DeviceKindSpec | undefined> = {
    [DeviceKind.INVERTER_VEICHI_SI23_V1]: { range: { min: 1, max: 10 }, discoveryRegister: DiscoveryAddressRegister.INVERTER },
    [DeviceKind.FLOWMETER_V1]: { range: { min: 11, max: 20 }, discoveryRegister: DiscoveryAddressRegister.FLOWMETER },
    [DeviceKind.PRESSURE_V1]: { range: { min: 21, max: 30 }, discoveryRegister: DiscoveryAddressRegister.PRESSURE },
    [DeviceKind.EC_METER_V1]: { range: { min: 31, max: 40 }, discoveryRegister: DiscoveryAddressRegister.EC_TMP_MOISTURE_METER },
    [DeviceKind.FLOWMETER_ULTRASONIC_V1]: { range: { min: 41, max: 50 }, discoveryRegister: DiscoveryAddressRegister.FLOWMETER_ULTRASONIC },
    [DeviceKind.TEMPERATURE_MOISTURE_V1]: { range: { min: 51, max: 60 }, discoveryRegister: DiscoveryAddressRegister.EC_TMP_MOISTURE_METER },
    [DeviceKind.DIGITAL_IO_8_CH]: { range: { min: 61, max: 70 }, discoveryRegister: DiscoveryAddressRegister.DIGITAL_IO },
    [DeviceKind.ANALOG_OUTPUT_8_CH]: { range: { min: 71, max: 80 }, discoveryRegister: DiscoveryAddressRegister.ANALOG_OUTPUT },
    [DeviceKind.ANALOG_INPUT_8_CH]: { range: { min: 81, max: 90 }, discoveryRegister: DiscoveryAddressRegister.ANALOG_INPUT },
    [DeviceKind.MODBUS_SLAVE]: { range: { min: 91, max: 100 } },
    [DeviceKind.UNKNOWN_DEVICE]: undefined,
};

export function getDeviceKindByAddress(address: number): DeviceKind | undefined {
    return (Object.keys(DEVICE_KIND_SPECS) as DeviceKind[]).find((kind) => {
        const range = DEVICE_KIND_SPECS[kind]?.range;
        return !!range && address >= range.min && address <= range.max;
    });
}

// Cibles du scan : registre de découverte lu sur le premier unit id de la plage de chaque kind
export function getDiscoveryTargets(): { kind: DeviceKind; unitId: number; register: number }[] {
    return (Object.entries(DEVICE_KIND_SPECS) as [DeviceKind, DeviceKindSpec | undefined][])
        .filter(([, spec]) => spec?.discoveryRegister !== undefined)
        .map(([kind, spec]) => ({ kind, unitId: spec!.range.min, register: spec!.discoveryRegister! }));
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
    // Modèle (SlaveTemplate._id) dont le slave partage les DeviceCommand
    public modelId?: string;
    // DeviceCommand init du modèle déjà appliquées sur ce slave (non rejouées sauf reset)
    public initDoneCommandIds?: string[];
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

// Slave renvoyé au front avec les DeviceCommand de son modèle (params résolus), non persisté tel quel
export type DeviceWithCommands = DeviceModel & { deviceCommands: DeviceCommandModel[] };

// Modèle d'un SLAVE et de ses DeviceCommand (partagées par tous les slaves créés depuis ce modèle)
export interface SlaveTemplate {
    _id: string;
    name: string;
    description?: string;
    kind: DeviceKind;
    device: Pick<DeviceModel, 'name' | 'description'> & Pick<SlaveConfigModel, 'kind' | 'portConfig'>;
    // _id absent = commande nouvelle (générée à la sauvegarde du modèle) ; params recalculé depuis la register map à la sauvegarde
    deviceCommands: (Omit<DeviceCommandModel, '_id' | 'modelId' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { _id?: string })[];
}
