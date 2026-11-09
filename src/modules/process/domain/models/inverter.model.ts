import { DeviceKind } from './device.model';

// Source de vitesse en mode auto (switchs S1..S3 ouverts) ; le manuel (switchs) n'est pas pilotable, il est détecté
export enum InverterMode {
    // PID interne du variateur (capteur AI1), consigne F11.01
    PID = 'PID',
    // consigne de fréquence écrite par la box (0x2000)
    RS485 = 'RS485'
}

// Rôles des commandes utilisées pour piloter le variateur (résolus par le profil de son kind)
export enum InverterRole {
    // sélection du mode auto (F00.06 sur SI23)
    MODE_SELECT = 'MODE_SELECT',
    // consigne de fréquence RS485 (0x2000 sur SI23)
    FREQUENCY_SETPOINT = 'FREQUENCY_SETPOINT',
    // consigne PID (F11.01 sur SI23)
    PID_SETPOINT = 'PID_SETPOINT',
    // action sur perte de liaison (F13.07 sur SI23)
    COMM_FAULT_ACTION = 'COMM_FAULT_ACTION'
}

// Directive donnée par une séquence au variateur pendant son exécution
export interface InverterDirective {
    mode: InverterMode;
    // RS485 : fréquence en Hz (bornée par le variateur entre ses limites basse et haute)
    frequency?: number;
    // PID : consigne dans l'unité de F11.01 (% sur SI23)
    pidSetpoint?: number;
}

// Directive portée par une séquence, pour un variateur donné
export interface SequenceInverterDirective extends InverterDirective {
    inverterId: string;
}

// Paramètre du variateur (champ autoCreateType=inverter de la register map) et valeur à y maintenir
export class InverterParameterModel {
    // bloc de la register map (code Fgg.ii)
    public blockId: string;
    // champ lu (fgg_ii)
    public field: string;
    public readCommandId: string;
    public setCommandId: string;
    // valeur cible, dans l'unité de la saisie du set ; absente : paramètre exposé mais non imposé
    public value?: number;
    // écriture EEPROM (conservée après coupure)
    public isPersistent: boolean = true;
}

// Élément variateur rattaché à un slave : piloté par les directives des séquences
export class InverterModel {
    public _id: string;
    public name: string;
    public description?: string;
    // slave Modbus du variateur
    public deviceId: string;
    // kind du slave : choisit le profil (rôles, valeurs des modes)
    public profile: DeviceKind;
    // commandIds par rôle
    public commands: Partial<Record<InverterRole, string>> = {};
    public parameters: InverterParameterModel[] = [];
    // sensor enfant portant l'état des entrées X (détection du manuel)
    public manualSensorId?: string;
    // mode appliqué quand aucune séquence ne pilote le variateur
    public defaultMode: InverterMode = InverterMode.PID;
    // délai avant de rendre la main au mode par défaut à la fin d'une séquence (évite le va-et-vient entre deux séquences)
    public releaseGraceMs: number = 3000;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}

// État runtime d'un variateur (non persisté)
export interface InverterRuntimeState {
    isManual: boolean;
    // séquence propriétaire de la directive courante
    ownerSequenceId?: string;
    ownerSequenceName?: string;
    directive?: InverterDirective;
    // dernières valeurs écrites (écritures idempotentes)
    applied: Partial<Record<InverterRole, number>>;
}
