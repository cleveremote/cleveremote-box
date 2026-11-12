import { SensorType } from '../interfaces/sensor.interface';
import { DeviceCommandModel } from './device-command.model';
import { SlaveTemplate } from './device.model';
import { OutOfRangePolicy } from '../utils/linear-scale.util';

// tous les champs sont optionnels : un sensor COM "racine" utilise cronPattern/commandId, un sensor
// enfant (parentId renseigne) utilise field - la valeur (decodee, unite comprise, par la register map)
// est alors extraite de la lecture du sensor parent, pas lue via son propre cron.
export class ComSensorConfigModel {
    // DeviceCommand (register map) lue à chaque tick
    public commandId?: string;
    // Slave sur lequel la commande est lue
    public deviceId?: string;
    // Nom du champ décodé à retenir (sensor enfant, ou surcharge de DeviceCommand.fields)
    public field?: string;
    public cronPattern?: string;
}

// Nature du signal électrique d'un capteur analogique : fixe l'unité des bornes d'entrée de la mise à l'échelle
export enum AnalogSignalType {
    // bornes en V (valeur lue en mV ou V)
    VOLTAGE = 'VOLTAGE',
    // bornes en mA (valeur lue en µA, mA ou A)
    CURRENT = 'CURRENT',
    // bornes dans l'unité brute lue (ex: code ADC 0-4095), sans conversion électrique
    RAW = 'RAW',
}

// Mise à l'échelle linéaire [inputMin, inputMax] (unité électrique selon signalType) -> [outputMin, outputMax] (unité physique) ;
// plages inversées admises (ex: 4-20 mA -> 10-0 bar), inputMin !== inputMax
export class AnalogScalingModel {
    public signalType: AnalogSignalType;
    public inputMin: number;
    public inputMax: number;
    public outputMin: number;
    public outputMax: number;
    // unité physique de la valeur convertie (bar, °C, %, m³/h...)
    public unit: string;
    public outOfRange: OutOfRangePolicy = OutOfRangePolicy.CLAMP;
}

// sensor ANALOG : lecture COM (racine ou enfant, cf. ComSensorConfigModel) convertie en grandeur physique
export class AnalogSensorConfigModel extends ComSensorConfigModel {
    public scaling: AnalogScalingModel;
}

export enum forcastDataName {
  // température actuelle (open-meteo `current`)
  TEMPERATURE_2M = 'temperature_2m',
  // prévisions journalières du lendemain (open-meteo `daily`, index 1)
  TEMPERATURE_2M_MAX = 'temperature_2m_max',
  TEMPERATURE_2M_MIN = 'temperature_2m_min'
}

// donnée FORCAST lue sur l'instant (open-meteo `current`) plutôt qu'en prévision J+1
export const IsCurrentForcastData = (data: forcastDataName): boolean => data === forcastDataName.TEMPERATURE_2M;


export class ForcastSensorConfigModel {
    public cronPattern: string;
    public forcastData: forcastDataName;
}

// Resume du modele (SlaveTemplate) proprietaire de la DeviceCommand d'un sensor COM
export type SensorTemplateModel = Pick<SlaveTemplate, '_id' | 'name' | 'description' | 'kind'>;

export class SensorModel {
    public _id: string;
    public name: string; 
    public description: string;
    public style: { bgColor: string; fontColor: string; iconColor: { base: string; icon: string } };
    public type: SensorType;
    public config: ForcastSensorConfigModel | ComSensorConfigModel | AnalogSensorConfigModel;

    public isEnabled?: boolean = true;
    public display?: boolean = true;

    // relation auto-referencee : un sensor enfant (parentId renseigne) remplit
    // field sur ComSensorConfigModel plutot que cronPattern/commandId.
    public parentId?: string | null = null;

    // cree automatiquement par la box (provisioning d'un slave, sensors meteo par defaut) et non par l'utilisateur ;
    // fixe a la creation, jamais modifie par une synchronisation du front
    public autoCreated?: boolean = false;

    public value?: number;
    public date?: Date;

    // renvoyes au front, non persistes (cf. SensorMapper) : DeviceCommand lue (params resolus) et modele
    // (SlaveTemplate) du slave ; un sensor enfant reprend ceux de son parent.
    public deviceCommand?: DeviceCommandModel;
    public model?: SensorTemplateModel;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
