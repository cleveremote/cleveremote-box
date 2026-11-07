import { SimulationBehavior } from '../behaviors/behavior.interface';
import {
    MODBUS_TABLES, ModbusExceptionCode, ModbusExceptionError, ModbusTable, SimulatedDeviceState, SimulatedTables, WriteResult
} from '../models/simulated-device.model';

// Plage d'adresses Modbus valide pour un slave (0 = broadcast)
const MIN_UNIT_ID = 1;
const MAX_UNIT_ID = 247;
// Valeurs FC05 standard
const COIL_ON = 0xFF00;
const COIL_OFF = 0x0000;

export type WordOrder = 'lowFirst' | 'highFirst';

/**
 * Équipement Modbus simulé générique : une banque de valeurs par table (lecture d'une adresse jamais écrite = 0)
 * et un registre de découverte qui porte l'adresse du module (lecture = unit id courant, écriture = réadressage).
 * Le comportement propre au type (behavior) peut imposer des lectures, intercepter des écritures et faire évoluer les mesures.
 */
export class SimulatedDevice {
    public readonly id: string;
    public readonly kind: string;
    private readonly _tables: Record<ModbusTable, Map<number, number>>;
    private _unitId: number;

    public constructor(
        state: SimulatedDeviceState,
        public readonly discoveryRegister: number,
        public readonly wordOrder: WordOrder,
        private readonly behavior?: SimulationBehavior
    ) {
        this._unitId = state.unitId;
        this._tables = MODBUS_TABLES.reduce((tables, table) => {
            const entries = Object.entries(state.tables?.[table] ?? {});
            tables[table] = new Map(entries.map(([address, value]) => [Number(address), Number(value)]));
            return tables;
        }, {} as Record<ModbusTable, Map<number, number>>);
        this.id = state.id;
        this.kind = state.kind;
        this.behavior?.initialize?.(this);
    }

    public get unitId(): number {
        return this._unitId;
    }

    /** Adresse appliquée après l'envoi de la réponse au réadressage (la réponse porte l'ancienne adresse) */
    public applyUnitId(unitId: number): void {
        this._unitId = unitId;
    }

    // Accès bruts à la banque, pour les behaviors
    public get(table: ModbusTable, address: number): number {
        return this._tables[table].get(address) ?? 0;
    }

    public has(table: ModbusTable, address: number): boolean {
        return this._tables[table].has(address);
    }

    public set(table: ModbusTable, address: number, value: number): void {
        this._tables[table].set(address, value);
    }

    public setIfAbsent(table: ModbusTable, address: number, value: number): void {
        if (!this.has(table, address)) {
            this.set(table, address, value);
        }
    }

    /** Lecture de `length` valeurs consécutives (FC01 à FC04) */
    public read(table: ModbusTable, address: number, length: number): number[] {
        return Array.from({ length }, (_, i) => this._readOne(table, address + i));
    }

    /**
     * Écriture de valeurs consécutives (FC05/06/15/16). Coils : valeur FC05 brute (0xFF00, 0x0000 ou custom, ex: 0x5500)
     * ou bit FC15 (1/0). Une écriture du registre de découverte renvoie la nouvelle adresse à appliquer après la réponse.
     */
    public write(table: ModbusTable, address: number, values: number[]): WriteResult {
        const result: WriteResult = {};
        values.forEach((value, i) => {
            const pendingUnitId = this._writeOne(table, address + i, value);
            if (pendingUnitId !== undefined) {
                result.pendingUnitId = pendingUnitId;
            }
        });
        return result;
    }

    public tick(dtMs: number): void {
        this.behavior?.tick?.(this, dtMs);
    }

    public toState(): SimulatedDeviceState {
        const tables = MODBUS_TABLES.reduce((acc, table) => {
            acc[table] = Object.fromEntries([...this._tables[table]].sort(([a], [b]) => a - b).map(([address, value]) => [String(address), value]));
            return acc;
        }, {} as SimulatedTables);
        return { id: this.id, kind: this.kind, unitId: this._unitId, tables };
    }

    private _readOne(table: ModbusTable, rawAddress: number): number {
        const address = this._normalize(table, rawAddress);
        if (this._isDiscoveryRegister(table, address)) {
            return this._unitId;
        }
        return this.behavior?.onRead?.(this, table, address) ?? this.get(table, address);
    }

    private _writeOne(table: ModbusTable, rawAddress: number, value: number): number | undefined {
        const address = this._normalize(table, rawAddress);
        if (this._isDiscoveryRegister(table, address)) {
            if (!Number.isInteger(value) || value < MIN_UNIT_ID || value > MAX_UNIT_ID) {
                throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE, `unit id ${value} hors plage ${MIN_UNIT_ID}-${MAX_UNIT_ID}`);
            }
            return value;
        }
        if (this.behavior?.onWrite?.(this, table, address, value)) {
            return undefined;
        }
        if (table === ModbusTable.COILS) {
            this.set(table, address, this._coilState(value));
            return undefined;
        }
        this.set(table, address, value & 0xFFFF);
        return undefined;
    }

    private _coilState(value: number): number {
        if (value === COIL_ON || value === 1) {
            return 1;
        }
        if (value === COIL_OFF) {
            return 0;
        }
        throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE, `valeur de coil ${value} non supportée`);
    }

    private _normalize(table: ModbusTable, address: number): number {
        return this.behavior?.normalizeAddress?.(table, address) ?? address;
    }

    private _isDiscoveryRegister(table: ModbusTable, address: number): boolean {
        return table === ModbusTable.HOLDING && address === this.discoveryRegister;
    }
}
