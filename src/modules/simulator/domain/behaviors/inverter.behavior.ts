import { ModbusExceptionCode, ModbusExceptionError, ModbusTable } from '../models/simulated-device.model';
import { SimulatedDevice } from '../services/simulated-device';
import { SimulationBehavior } from './behavior.interface';

// Adresses de veichi-si23-inverter.json
const FREQUENCY_COMMAND = 0x2000;
const RUN_COMMAND = 0x2001;
const MONITORING_START = 0x2100;
const MONITORING_COUNT = 20;
// Écritures persistantes (EEPROM) : adresse + 0x1000 (params.persistence.address) ; la map s'arrête à 0x232E
const PERSISTENCE_OFFSET = 0x1000;

// Enum runCommand
const RUN_FORWARD = 1;
const RUN_REVERSE = 2;
const JOG_FORWARD = 3;
const JOG_REVERSE = 4;
const STOP = 5;
const COAST_STOP = 6;
const FAULT_RESET = 7;
const RUNNING_COMMANDS = [RUN_FORWARD, RUN_REVERSE, JOG_FORWARD, JOG_REVERSE];

// Grandeurs simulées (unités brutes de la map : fréquences en 0.01 Hz, tensions en 0.1 V...)
const RATED_FREQUENCY = 5000;
// Rampe d'accélération/décélération : 5 Hz/s
const RAMP_PER_SECOND = 500;
const JOG_FREQUENCY = 500;
const RATED_CURRENT = 80;
const DC_BUS_VOLTAGE = 5400;
const RATED_OUTPUT_VOLTAGE = 3800;
const RPM_PER_HZ = 30;
const AMBIENT_TEMPERATURE = 350;

/**
 * Variateur Veichi SI23 : marche/arrêt (runCommand), consigne (frequencyCommand), rampe de la fréquence de sortie
 * et bloc de surveillance C00.00-C00.19 calculé à la lecture. Les autres paramètres sont lus/écrits dans la banque.
 */
export class InverterBehavior implements SimulationBehavior {
    // Fréquence de sortie courante (0.01 Hz), volatile : redémarre à l'arrêt
    private _outputFrequency = 0;

    // À la mise sous tension le variateur est à l'arrêt
    public initialize(device: SimulatedDevice): void {
        device.setIfAbsent(ModbusTable.HOLDING, RUN_COMMAND, STOP);
    }

    public normalizeAddress(table: ModbusTable, address: number): number {
        const isPersistentAlias = (address >= 0x1000 && address < 0x2000) || (address >= 0x3000 && address < 0x4000);
        return table === ModbusTable.HOLDING && isPersistentAlias ? address - PERSISTENCE_OFFSET : address;
    }

    public onWrite(device: SimulatedDevice, table: ModbusTable, address: number, value: number): boolean {
        if (table !== ModbusTable.HOLDING || address !== RUN_COMMAND) {
            return false;
        }
        if (value < RUN_FORWARD || value > FAULT_RESET) {
            throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE, `runCommand ${value} inconnu`);
        }
        if (value === COAST_STOP) {
            this._outputFrequency = 0;
        }
        // FAULT_RESET ne change pas l'état de marche
        if (value !== FAULT_RESET) {
            device.set(table, address, value);
        }
        return true;
    }

    public onRead(device: SimulatedDevice, table: ModbusTable, address: number): number | undefined {
        const offset = address - MONITORING_START;
        if (table !== ModbusTable.HOLDING || offset < 0 || offset >= MONITORING_COUNT) {
            return undefined;
        }
        return this._monitoring(device)[offset] ?? 0;
    }

    public tick(device: SimulatedDevice, dtMs: number): void {
        const target = this._isRunning(device) ? this._setpoint(device) : 0;
        const step = RAMP_PER_SECOND * dtMs / 1000;
        const delta = target - this._outputFrequency;
        this._outputFrequency = Math.abs(delta) <= step ? target : this._outputFrequency + Math.sign(delta) * step;
        this._outputFrequency = Math.round(this._outputFrequency);
    }

    // Valeurs brutes C00.00-C00.13 (offset dans le bloc) ; au-delà : 0 (bornes, AI, PUL)
    private _monitoring(device: SimulatedDevice): Record<number, number> {
        const ratio = Math.min(1, this._outputFrequency / RATED_FREQUENCY);
        const temperature = Math.round(AMBIENT_TEMPERATURE + 100 * ratio);
        return {
            0: this._setpoint(device),
            1: this._outputFrequency,
            2: Math.round(RATED_CURRENT * ratio),
            3: DC_BUS_VOLTAGE,
            4: Math.round(RATED_OUTPUT_VOLTAGE * ratio),
            5: Math.round((this._outputFrequency / 100) * RPM_PER_HZ),
            6: this._isRunning(device) ? 1000 : 0,
            7: Math.round(800 * ratio),
            10: Math.round(1000 * ratio ** 3),
            11: DC_BUS_VOLTAGE,
            12: temperature,
            13: temperature
        };
    }

    private _isRunning(device: SimulatedDevice): boolean {
        return RUNNING_COMMANDS.includes(device.get(ModbusTable.HOLDING, RUN_COMMAND));
    }

    private _setpoint(device: SimulatedDevice): number {
        const command = device.get(ModbusTable.HOLDING, RUN_COMMAND);
        return command === JOG_FORWARD || command === JOG_REVERSE ? JOG_FREQUENCY : device.get(ModbusTable.HOLDING, FREQUENCY_COMMAND);
    }
}
