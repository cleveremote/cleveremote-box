import { SensorType } from '../interfaces/sensor.interface';
import { DeviceCommandModel } from './device-command.model';
import { SlaveTemplate } from './device.model';

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

export enum forcastDataName {
  TEMPERATURE_2M_MAX = 'temperature_2m_max',
  TEMPERATURE_2M_MIN = 'temperature_2m_min'
}


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
    public config: ForcastSensorConfigModel | ComSensorConfigModel;

    public isEnabled?: boolean = true;
    public display?: boolean = true;

    // relation auto-referencee : un sensor enfant (parentId renseigne) remplit
    // field sur ComSensorConfigModel plutot que cronPattern/commandId.
    public parentId?: string | null = null;

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
