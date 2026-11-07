// Tables Modbus d'un équipement simulé
export enum ModbusTable {
    COILS = 'coils',
    DISCRETE_INPUTS = 'discreteInputs',
    HOLDING = 'holding',
    INPUT = 'input'
}

export const MODBUS_TABLES: ModbusTable[] = [ModbusTable.COILS, ModbusTable.DISCRETE_INPUTS, ModbusTable.HOLDING, ModbusTable.INPUT];

// Codes d'exception Modbus renvoyés par le simulateur
export enum ModbusExceptionCode {
    ILLEGAL_FUNCTION = 0x01,
    ILLEGAL_DATA_ADDRESS = 0x02,
    ILLEGAL_DATA_VALUE = 0x03,
    SLAVE_DEVICE_FAILURE = 0x04
}

/** Levée par un équipement simulé : renvoyée au client en réponse d'exception (FC | 0x80) */
export class ModbusExceptionError extends Error {
    public constructor(public readonly code: ModbusExceptionCode, message?: string) {
        super(message ?? `modbus exception ${code}`);
    }
}

// Valeurs écrites, par table puis adresse (clés JSON = adresses décimales)
export type SimulatedTables = Record<ModbusTable, Record<string, number>>;

/** État persisté d'un équipement simulé (adresse courante et registres écrits) */
export interface SimulatedDeviceState {
    id: string;
    kind: string;
    unitId: number;
    tables: SimulatedTables;
}

export interface SimulatorState {
    devices: SimulatedDeviceState[];
}

/** Résultat d'une écriture : nouvelle adresse à appliquer une fois la réponse envoyée (écriture du registre d'adresse) */
export interface WriteResult {
    pendingUnitId?: number;
}
