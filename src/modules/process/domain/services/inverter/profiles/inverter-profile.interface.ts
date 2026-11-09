import { DeviceKind } from '@process/domain/models/device.model';
import { InverterMode, InverterRole } from '@process/domain/models/inverter.model';

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
}
