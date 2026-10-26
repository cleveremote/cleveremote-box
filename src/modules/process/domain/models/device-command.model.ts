import { RegisterOperationParams, RegisterOperationValue } from '@register-map/domain/models/register-map.model';

// Usage de la commande : pilotage (set), lecture (read), init du device (init), remise à zéro (reset)
export enum DeviceCommandType {
    SET = 'set',
    READ = 'read',
    INIT = 'init',
    RESET = 'reset',
}

// Opération de la register map d'un modèle de slave, partagée par tous les slaves de ce modèle et prête à
// exécuter (sensors, actuators, init des devices) : le slave visé est fourni à l'exécution ; adresse,
// fonction Modbus, encodage et décodage viennent du template du kind du modèle.
export class DeviceCommandModel {
    public _id: string;
    // Modèle (SlaveTemplate._id) propriétaire : seuls les slaves de ce modèle (config.modelId) l'exécutent
    public modelId: string;
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
    // Usages de la commande (cumulables, ex: [init, reset]) ; chaque stratégie n'exécute que ceux de son appel.
    // init : exécutée à l'initialisation du device (ex: mode des sorties, paramètres variateur) ;
    // reset : exécutée à la remise à zéro du device, avant de rejouer l'init
    public types: DeviceCommandType[];
    // Paramètres attendus (voie, valeur) et leur type détaillé (listes, bornes) pour les formulaires du front ;
    // persisté, recalculé depuis la register map du kind du modèle à chaque enregistrement et à chaque lecture
    public params?: RegisterOperationParams;
    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}

// Surcharge appliquée au moment de l'exécution (ex: voie et consigne d'un actionneur)
export type DeviceCommandOverride = Partial<Pick<DeviceCommandModel, 'channel' | 'value'>>;

// Paramètre onduleur (code Fgg.ii = bloc de sa register map) ; persist : écriture EEPROM
export interface InverterConfigParam {
    param: string;
    value: number;
    persist?: boolean;
}
