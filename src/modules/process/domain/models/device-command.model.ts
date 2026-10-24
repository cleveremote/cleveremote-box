import { RegisterOperationValue } from '@register-map/domain/models/register-map.model';

// Opération de la register map d'un slave, prête à exécuter (remplaçant du ComRequestModel) :
// adresse, fonction Modbus, encodage et décodage viennent du template du kind du slave.
export class DeviceCommandModel {
    public _id: string;
    // Slave cible : son config.kind désigne la register map
    public deviceId: string;
    public name: string;
    public description?: string;
    // registerMap[].id
    public blockId: string;
    // registerMap[].operations[].id
    public operationId: string;
    // Voie par défaut (scope 'channel'), surchargeable à l'exécution
    public channel?: number;
    // Valeur par défaut (écriture), surchargeable à l'exécution
    public value?: RegisterOperationValue;
    public isPersistent?: boolean;
    // Requis pour les blocs `danger`
    public isConfirmed?: boolean;
    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}

// Surcharge appliquée au moment de l'exécution (ex: voie et consigne d'un actionneur)
export type DeviceCommandOverride = Partial<Pick<DeviceCommandModel, 'channel' | 'value'>>;
