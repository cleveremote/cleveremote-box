import { DeviceKind } from '@process/domain/models/device.model';
import { InverterAnalogInput, InverterMode, InverterRole } from '@process/domain/models/inverter.model';

// Bloc / opération de la register map tenant un rôle
export interface InverterRoleRef {
    blockId: string;
    operationId: string;
}

// Écriture d'un rôle (valeur brute de la saisie du set) propre à un mode, en RAM
export interface InverterModeWrite {
    role: InverterRole;
    value: number;
}

// Blocs de la courbe d'une entrée analogique : tension basse / haute ↔ consigne (%) basse / haute
export interface InverterAnalogCurve {
    lowVoltage: string;
    lowPercent: string;
    highVoltage: string;
    highPercent: string;
}

// Source du retour PID : bloc qui la choisit, entrée analogique par valeur, valeur d'usine (bloc non imposé)
export interface InverterPidSource {
    blockId: string;
    inputs: Record<number, InverterAnalogInput>;
    defaultValue: number;
}

/**
 * Profil d'un modèle de variateur : quelles commandes tiennent quels rôles, quelles valeurs écrire par mode,
 * quels paramètres imposer une fois (baseline, EEPROM) et comment reconnaître le mode manuel.
 * Les paramètres eux-mêmes sont désignés dans la register map (champs autoCreateType=inverter) ; le profil n'en
 * porte que les valeurs.
 */
export interface InverterProfile {
    kind: DeviceKind;
    roles: Record<InverterRole, InverterRoleRef>;
    // valeurs brutes (unité de la saisie du set) par bloc ; absent : paramètre exposé mais non imposé
    baseline: Record<string, number>;
    // écritures RAM qui font passer le variateur dans le mode (dans l'ordre)
    modes: Record<InverterMode, InverterModeWrite[]>;
    // champ de lecture portant l'état des entrées logiques
    inputsField: string;
    // bits de inputsField signifiant le mode manuel (au moins un actif)
    manualInputMask: number;
    // courbe de chaque entrée analogique (caractéristique du capteur reportée)
    analogCurves: Record<InverterAnalogInput, InverterAnalogCurve>;
    pidSource: InverterPidSource;
    // tension équivalente d'1 mA sur une entrée en courant (bornes de la courbe toujours exprimées en V)
    voltsPerMilliAmp: number;
}
