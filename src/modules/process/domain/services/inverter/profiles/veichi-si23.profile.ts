import { DeviceKind } from '@process/domain/models/device.model';
import { InverterMode, InverterRole } from '@process/domain/models/inverter.model';
import { InverterProfile } from './inverter-profile.interface';

// bits de C00.14 (bit n = Xn+1, cf. enum inputTerminals) : switchs S1..S3 câblés sur X3..X5 (à vérifier sur l'appareil)
const X3 = 1 << 2;
const X4 = 1 << 3;
const X5 = 1 << 4;

/**
 * Veichi SI23 — 3 modes de pilotage (PID / RS485 / Manuel).
 * - Le pressostat (X1) est seul à démarrer / arrêter la pompe : 0x2001 n'est jamais écrit.
 * - Switchs S1..S3 (X3..X5, multi-vitesses) : manuel, prioritaire ; détecté par C00.14, jamais piloté.
 * - Sinon F00.06 choisit la vitesse : 0 = PID (voie A), 1 = RS485 (voie B, 0x2000).
 * Baseline (EEPROM) : PID par défaut et F13.07 = 0 ; le passage en RS485 n'écrit qu'en RAM (F00.06 = 1, F13.07 = 1),
 * une coupure secteur ramène donc le variateur en PID sans défaut de communication.
 * Valeurs brutes (unité de la saisie du set : Hz × 100, s × 100, % × 10, s × 10 pour F13.06).
 */
export const VEICHI_SI23_PROFILE: InverterProfile = {
    kind: DeviceKind.INVERTER_VEICHI_SI23_V1,
    roles: {
        [InverterRole.MODE_SELECT]: { blockId: 'F00.06', operationId: 'set' },
        [InverterRole.FREQUENCY_SETPOINT]: { blockId: 'frequencyCommand', operationId: 'set' },
        [InverterRole.PID_SETPOINT]: { blockId: 'F11.01', operationId: 'set' },
        [InverterRole.COMM_FAULT_ACTION]: { blockId: 'F13.07', operationId: 'set' }
    },
    baseline: {
        'F00.02': 1, // marche / arrêt par bornier (pressostat)
        'F00.03': 8, // voie A = PID
        'F00.04': 6, // voie B = RS485
        'F00.05': 0, // voie B rapportée à la fréquence max
        'F00.06': 0, // mode auto au démarrage : PID
        'F00.07': 0, // aucune liaison de commande
        'F00.09': 5000, // fréquence max 50.00 Hz
        'F00.11': 4000, // limite haute 40.00 Hz
        'F00.12': 3000, // limite basse 30.00 Hz
        'F00.14': 2500, // accélération 25.00 s
        'F00.15': 2500, // décélération 25.00 s
        'F01.10': 0, // arrêt par décélération
        'F01.35': 1, // redémarrage après coupure secteur
        'F02.00': 1, // X1 = marche avant (pressostat)
        'F02.01': 0, // X2 sans fonction
        'F02.02': 16, // X3 = multi-vitesse 1 (S1)
        'F02.03': 17, // X4 = multi-vitesse 2 (S2)
        'F02.04': 18, // X5 = multi-vitesse 3 (S3)
        'F02.23': 0, // commande 2 fils : pressostat fermé = marche
        'F02.24': 0, // pas de protection au redémarrage
        'F11.00': 0, // consigne PID au clavier (F11.01, écrite en RAM par les séquences)
        'F12.00': 3000, // vitesse S1 30.00 Hz
        'F12.01': 3500, // vitesse S2 35.00 Hz
        'F12.03': 4000, // vitesse S3 40.00 Hz
        'F13.06': 100, // délai de perte de liaison 10.0 s (couvre la lecture du monitoring toutes les 5 s)
        'F13.07': 0 // pas de détection de perte de liaison hors RS485
    },
    modes: {
        [InverterMode.PID]: [
            { role: InverterRole.MODE_SELECT, value: 0 },
            { role: InverterRole.COMM_FAULT_ACTION, value: 0 }
        ],
        [InverterMode.RS485]: [
            { role: InverterRole.MODE_SELECT, value: 1 },
            // perte de liaison en RS485 : défaut E.CE et arrêt roue libre
            { role: InverterRole.COMM_FAULT_ACTION, value: 1 }
        ]
    },
    inputsField: 'c00_14',
    manualInputMask: X3 | X4 | X5
};
