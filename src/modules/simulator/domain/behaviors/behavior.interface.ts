import { ModbusTable } from '../models/simulated-device.model';
import type { SimulatedDevice } from '../services/simulated-device';

/**
 * Comportement propre à un type d'équipement, greffé sur la banque de registres générique de SimulatedDevice.
 * Une instance par équipement simulé (état d'exécution volatile, ex: fréquence de sortie d'un variateur).
 */
export interface SimulationBehavior {
    // Adresse réellement visée (ex: alias EEPROM +0x1000 du variateur) ; appliquée avant tout autre traitement
    normalizeAddress?(table: ModbusTable, address: number): number;
    // Valeur lue imposée ; undefined = valeur stockée
    onRead?(device: SimulatedDevice, table: ModbusTable, address: number): number | undefined;
    // true = écriture prise en charge (rien n'est stocké par défaut)
    onWrite?(device: SimulatedDevice, table: ModbusTable, address: number, value: number): boolean;
    // Appelé périodiquement (évolution des mesures, rampes...)
    tick?(device: SimulatedDevice, dtMs: number): void;
    // Valeurs initiales posées si absentes (équipement neuf ou état rechargé)
    initialize?(device: SimulatedDevice): void;
}

export type SimulationBehaviorFactory = () => SimulationBehavior;
