import { SensorType } from '../interfaces/sensor.interface';

// tous les champs sont optionnels : un sensor COM "racine" utilise cronPattern/comRequestId (ou
// commandId), un sensor enfant (parentId renseigne) utilise code/scale/unit (ou field) - la valeur
// est alors extraite de la lecture du sensor parent, pas lue via son propre cron.
export class ComSensorConfigModel {
    public comRequestId?: string;
    // DeviceCommand (register map) : prioritaire sur comRequestId
    public commandId?: string;
    // Nom du champ décodé à retenir (lecture à plusieurs champs, ou sensor enfant)
    public field?: string;
    public cronPattern?: string;
    public code?: number;
    public scale?: number;
    public unit?: string;
}

export enum forcastDataName {
  TEMPERATURE_2M_MAX = 'temperature_2m_max',
  TEMPERATURE_2M_MIN = 'temperature_2m_min'
}


export class ForcastSensorConfigModel {
    public cronPattern: string;
    public forcastData: forcastDataName;
}

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
    // code/scale/unit sur ComSensorConfigModel plutot que cronPattern/comRequestId.
    public parentId?: string | null = null;

    public value?: number;
    public date?: Date;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
