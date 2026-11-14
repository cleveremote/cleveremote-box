import { ModbusExceptionCode, ModbusExceptionError, ModbusTable } from '../models/simulated-device.model';
import { SimulatedDevice } from '../services/simulated-device';
import { SimulationBehavior } from './behavior.interface';

// Adresses de veichi-si23-inverter.json
const FREQUENCY_COMMAND = 0x2000;
const RUN_COMMAND = 0x2001;
const MONITORING_START = 0x2100;
const MONITORING_COUNT = 20;
// C00.14 : état des entrées X (bit n = Xn+1). Inscriptible sur le simulateur uniquement (FC06) : simule le pressostat
// (X1) et les switchs S1..S3 (X3..X5) ; conservé à l'arrêt du simulateur (câblage physique)
const INPUTS_REGISTER = MONITORING_START + 14;
const INPUTS_OFFSET = 14;
const PID_REFERENCE_OFFSET = 8;
// Paramètres Fgg.ii (gg × 256 + ii)
const RUN_CHANNEL = 0x002; // F00.02 : 1 = bornier
const FREQUENCY_SOURCE_SELECTION = 0x006; // F00.06 : 0 = voie A (PID), 1 = voie B (RS485)
const MAX_FREQUENCY = 0x009; // F00.09
const UPPER_LIMIT = 0x00B; // F00.11
const LOWER_LIMIT = 0x00C; // F00.12
const INPUT_FUNCTIONS = 0x200; // F02.00 (X1) .. F02.04 (X5)
const PID_KEYPAD_REFERENCE = 0xB01; // F11.01 (0.1 %)
const MULTI_SPEEDS = 0xC00; // F12.00 .. F12.06
const COMM_TIMEOUT = 0xD06; // F13.06 (0.1 s)
const COMM_FAULT_ACTION = 0xD07; // F13.07 : 1 = défaut E.CE et arrêt roue libre
// Écritures persistantes (EEPROM) : adresse + 0x1000 (params.persistence.address) ; la map s'arrête à 0x232E
const PERSISTENCE_OFFSET = 0x1000;
// Paramètres et commandes en RAM : rechargés depuis l'EEPROM (sinon valeur usine) à la mise sous tension
const RAM_RANGES: [number, number][] = [[0x0000, 0x0FFF], [0x2000, 0x20FF]];

// Enum runCommand
const RUN_FORWARD = 1;
const RUN_REVERSE = 2;
const JOG_FORWARD = 3;
const JOG_REVERSE = 4;
const STOP = 5;
const COAST_STOP = 6;
const FAULT_RESET = 7;
const RUNNING_COMMANDS = [RUN_FORWARD, RUN_REVERSE, JOG_FORWARD, JOG_REVERSE];
// Enum inputFunction
const INPUT_RUN_FORWARD = 1;
const INPUT_MULTI_SPEED_1 = 16;
const INPUT_MULTI_SPEED_3 = 18;
const RUN_BY_TERMINAL = 1;
const CHANNEL_B = 1;
const COMM_FAULT_STOP = 1;

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

const IsPersistentAlias = (address: number): boolean =>
    (address >= 0x1000 && address < 0x2000) || (address >= 0x3000 && address < 0x4000);
const IsRam = (address: number): boolean => RAM_RANGES.some(([min, max]) => address >= min && address <= max);

/**
 * Variateur Veichi SI23 :
 * - RAM (adresse) / EEPROM (adresse + 0x1000) : une écriture EEPROM met à jour les deux, la RAM est rechargée depuis
 *   l'EEPROM à la mise sous tension (redémarrage du simulateur) ;
 * - marche : par bornier X1 (pressostat, F00.02 = 1) ou par runCommand ;
 * - vitesse : multi-vitesses F12.xx si une entrée multi-vitesse est active (switchs), sinon F00.06 : RS485 (0x2000)
 *   ou PID (simulé : F11.01 % de F00.09), bornée par F00.12 / F00.11 ; rampe de la fréquence de sortie ;
 * - perte de liaison : F13.07 = 1 et aucune trame pendant F13.06 => défaut E.CE (arrêt), effacé par runCommand = 7 ;
 * - bloc de surveillance C00.00-C00.19 calculé à la lecture (C00.14 : entrées X stockées).
 */
export class InverterBehavior implements SimulationBehavior {
    // Fréquence de sortie courante (0.01 Hz), volatile : redémarre à l'arrêt
    private _outputFrequency = 0;
    private _lastFrameAt = Date.now();
    private isCommFault = false;

    // Mise sous tension : RAM = EEPROM (sinon valeur usine), variateur à l'arrêt
    public initialize(device: SimulatedDevice): void {
        for (const address of device.addresses(ModbusTable.HOLDING)) {
            if (IsRam(address) && !device.has(ModbusTable.HOLDING, address + PERSISTENCE_OFFSET)) {
                device.delete(ModbusTable.HOLDING, address);
            }
        }
        for (const address of device.addresses(ModbusTable.HOLDING).filter(IsPersistentAlias)) {
            device.set(ModbusTable.HOLDING, address - PERSISTENCE_OFFSET, device.get(ModbusTable.HOLDING, address));
        }
        device.setIfAbsent(ModbusTable.HOLDING, RUN_COMMAND, STOP);
        this._lastFrameAt = Date.now();
    }

    public onWrite(device: SimulatedDevice, table: ModbusTable, address: number, value: number): boolean {
        if (table !== ModbusTable.HOLDING) {
            return false;
        }
        this._lastFrameAt = Date.now();
        const ramAddress = IsPersistentAlias(address) ? address - PERSISTENCE_OFFSET : address;
        if (ramAddress === RUN_COMMAND) {
            this._writeRunCommand(device, value);
            return true;
        }
        if (ramAddress === address) {
            return false;
        }
        // EEPROM : valeur conservée et appliquée immédiatement (RAM)
        device.set(table, address, value & 0xFFFF);
        device.set(table, ramAddress, value & 0xFFFF);
        return true;
    }

    private _writeRunCommand(device: SimulatedDevice, value: number): void {
        if (value < RUN_FORWARD || value > FAULT_RESET) {
            throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE, `runCommand ${value} inconnu`);
        }
        if (value === COAST_STOP) {
            this._outputFrequency = 0;
        }
        if (value === FAULT_RESET) {
            // FAULT_RESET ne change pas l'état de marche
            this.isCommFault = false;
            return;
        }
        device.set(ModbusTable.HOLDING, RUN_COMMAND, value);
    }

    public onRead(device: SimulatedDevice, table: ModbusTable, address: number): number | undefined {
        if (table !== ModbusTable.HOLDING) {
            return undefined;
        }
        this._lastFrameAt = Date.now();
        if (IsPersistentAlias(address)) {
            return device.has(table, address) ? device.get(table, address) : device.get(table, address - PERSISTENCE_OFFSET);
        }
        const offset = address - MONITORING_START;
        if (offset < 0 || offset >= MONITORING_COUNT) {
            return undefined;
        }
        return this._monitoring(device)[offset] ?? 0;
    }

    public tick(device: SimulatedDevice, dtMs: number): void {
        this._checkCommLoss(device);
        const target = this._isRunning(device) ? this._setpoint(device) : 0;
        const step = RAMP_PER_SECOND * dtMs / 1000;
        const delta = target - this._outputFrequency;
        this._outputFrequency = Math.abs(delta) <= step ? target : this._outputFrequency + Math.sign(delta) * step;
        this._outputFrequency = Math.round(this._outputFrequency);
    }

    private _checkCommLoss(device: SimulatedDevice): void {
        const timeoutMs = this._ram(device, COMM_TIMEOUT) * 100;
        const isWatched = this._ram(device, COMM_FAULT_ACTION) === COMM_FAULT_STOP && timeoutMs > 0;
        if (isWatched && !this.isCommFault && Date.now() - this._lastFrameAt > timeoutMs) {
            this.isCommFault = true;
            this._outputFrequency = 0;
        }
    }

    // Valeurs brutes C00.00-C00.14 (offset dans le bloc) ; au-delà : 0 (sorties, AI, PUL)
    private _monitoring(device: SimulatedDevice): Record<number, number> {
        const ratio = Math.min(1, this._outputFrequency / RATED_FREQUENCY);
        const temperature = Math.round(AMBIENT_TEMPERATURE + 100 * ratio);
        const isPid = this._multiSpeedIndex(device) === 0 && this._ram(device, FREQUENCY_SOURCE_SELECTION) !== CHANNEL_B;
        return {
            0: this._setpoint(device),
            1: this._outputFrequency,
            2: Math.round(RATED_CURRENT * ratio),
            3: DC_BUS_VOLTAGE,
            4: Math.round(RATED_OUTPUT_VOLTAGE * ratio),
            5: Math.round((this._outputFrequency / 100) * RPM_PER_HZ),
            6: this._isRunning(device) ? 1000 : 0,
            7: Math.round(800 * ratio),
            [PID_REFERENCE_OFFSET]: isPid ? this._ram(device, PID_KEYPAD_REFERENCE) : 0,
            10: Math.round(1000 * ratio ** 3),
            11: DC_BUS_VOLTAGE,
            12: temperature,
            13: temperature,
            [INPUTS_OFFSET]: this._inputs(device)
        };
    }

    private _ram(device: SimulatedDevice, address: number): number {
        return device.get(ModbusTable.HOLDING, address);
    }

    private _inputs(device: SimulatedDevice): number {
        return device.get(ModbusTable.HOLDING, INPUTS_REGISTER);
    }

    // entrées actives (bit n = Xn+1) dont la fonction (F02.0n) est `fn`
    private _activeInputs(device: SimulatedDevice, isFunction: (fn: number) => boolean): number[] {
        const inputs = this._inputs(device);
        return [0, 1, 2, 3, 4]
            .filter((terminal) => (inputs >> terminal) & 1)
            .map((terminal) => this._ram(device, INPUT_FUNCTIONS + terminal))
            .filter(isFunction);
    }

    private _isRunning(device: SimulatedDevice): boolean {
        if (this.isCommFault) {
            return false;
        }
        if (this._ram(device, RUN_CHANNEL) === RUN_BY_TERMINAL) {
            return this._activeInputs(device, (fn) => fn === INPUT_RUN_FORWARD).length > 0;
        }
        return RUNNING_COMMANDS.includes(device.get(ModbusTable.HOLDING, RUN_COMMAND));
    }

    // multi-vitesses actives : 1 (S1 seul) .. 7 (S1+S2+S3) ; 0 = aucune (mode auto)
    private _multiSpeedIndex(device: SimulatedDevice): number {
        return this._activeInputs(device, (fn) => fn >= INPUT_MULTI_SPEED_1 && fn <= INPUT_MULTI_SPEED_3)
            .reduce((index, fn) => index | (1 << (fn - INPUT_MULTI_SPEED_1)), 0);
    }

    private _setpoint(device: SimulatedDevice): number {
        const command = device.get(ModbusTable.HOLDING, RUN_COMMAND);
        if (this._ram(device, RUN_CHANNEL) !== RUN_BY_TERMINAL && (command === JOG_FORWARD || command === JOG_REVERSE)) {
            return JOG_FREQUENCY;
        }
        const multiSpeed = this._multiSpeedIndex(device);
        let setpoint: number;
        if (multiSpeed) {
            setpoint = this._ram(device, MULTI_SPEEDS + multiSpeed - 1);
        } else if (this._ram(device, FREQUENCY_SOURCE_SELECTION) === CHANNEL_B) {
            setpoint = device.get(ModbusTable.HOLDING, FREQUENCY_COMMAND);
        } else {
            // PID simulé : sortie proportionnelle à la consigne F11.01 (0.1 %) de la fréquence max
            const maxFrequency = this._ram(device, MAX_FREQUENCY) || RATED_FREQUENCY;
            setpoint = Math.round(this._ram(device, PID_KEYPAD_REFERENCE) * maxFrequency / 1000);
        }
        return this._clamp(device, setpoint);
    }

    private _clamp(device: SimulatedDevice, setpoint: number): number {
        const upper = this._ram(device, UPPER_LIMIT);
        const lower = this._ram(device, LOWER_LIMIT);
        const bounded = upper > 0 ? Math.min(setpoint, upper) : setpoint;
        return Math.max(bounded, lower);
    }
}
