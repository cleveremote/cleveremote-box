import { ModbusTable } from '../models/simulated-device.model';
import { SimulatedDevice } from '../services/simulated-device';

// Adresses de veichi-si23-inverter.json
const MONITORING_START = 0x2100;
// C00.08 / C00.09 : consigne / retour PID (0.1 % × F11.06)
const PID_REFERENCE_OFFSET = 8;
const PID_FEEDBACK_OFFSET = 9;
// C00.16 / C00.17 : entrées AI1 / AI2 (mV). Inscriptibles sur le simulateur (FC06) : force la tension du capteur
// (conservée comme le câblage) ; 0xFFFF = non forcée, rend la main au process simulé
const AI_OFFSETS = [16, 17];
const AI_RELEASE = 0xFFFF;
// Commandes PID par communication (0.1 %), actives si F11.00 / F11.03 = 6
const PID_REFERENCE_COMMAND = 0x2008;
const PID_FEEDBACK_COMMAND = 0x2009;
// Mise à l'échelle AI1 (F03.00..F03.03) / AI2 (F03.06..F03.09) : tension basse (0.01 V), % bas (0.01 %, signé),
// tension haute (0.01 V), % haut (0.01 %, signé)
const AI_SCALING = [0x300, 0x306];
const PID_REFERENCE_SOURCE = 0xB00; // F11.00
const PID_KEYPAD_REFERENCE = 0xB01; // F11.01 (0.1 %)
const PID_FEEDBACK_SOURCE = 0xB03; // F11.03
const PID_FEEDBACK_GAIN = 0xB05; // F11.05 (0.01)
const PID_RANGE = 0xB06; // F11.06 (0.1) : affichage C00.08 / C00.09
const PID_CONTROL = 0xB07; // F11.07 : chiffre 0 = caractéristique négative, chiffre 3 = dérivée sur le retour
const PID_PROPORTIONAL = 0xB0B; // F11.11 (0.001)
const PID_INTEGRAL = 0xB0C; // F11.12 (0.1 s, 0 = pas d'intégrale)
const PID_DERIVATIVE = 0xB0D; // F11.13 (0.001 s)
const PID_OUTPUT_MAX = 0xB16; // F11.22 (0.1 %)
const PID_OUTPUT_MIN = 0xB17; // F11.23 (0.1 %)
const PID_BREAK_TIME = 0xB19; // F11.25 (0.1 s)
const PID_BREAK_ACTION = 0xB1A; // F11.26 : 0/2 continue, 1 = défaut E.PId et arrêt, 3 = sortie figée
const PID_BREAK_HIGH = 0xB1B; // F11.27 (0.1 %)
const PID_BREAK_LOW = 0xB1C; // F11.28 (0.1 %)

// Enum pidSource
const PID_SOURCE_KEYPAD = 0;
const PID_SOURCE_AI1 = 2;
const PID_SOURCE_AI2 = 3;
const PID_SOURCE_COMM = 6;
// Enum pidWireBreak
const PID_BREAK_FAULT = 1;
const PID_BREAK_FREEZE = 3;

// Valeurs usine (brutes) des paramètres lus par le simulateur, appliquées tant qu'ils n'ont pas été écrits
const FACTORY_DEFAULTS: Record<number, number> = {
    [AI_SCALING[0] + 2]: 1000, [AI_SCALING[0] + 3]: 10000,
    [AI_SCALING[1] + 2]: 1000, [AI_SCALING[1] + 3]: 10000,
    [PID_KEYPAD_REFERENCE]: 500, [PID_FEEDBACK_SOURCE]: PID_SOURCE_AI1, [PID_FEEDBACK_GAIN]: 100,
    [PID_RANGE]: 1000, [PID_CONTROL]: 0x0100, [PID_PROPORTIONAL]: 100, [PID_INTEGRAL]: 10,
    [PID_OUTPUT_MAX]: 1000, [PID_BREAK_TIME]: 10, [PID_BREAK_HIGH]: 1000
};

const ToInt16 = (value: number): number => (value & 0x8000 ? value - 0x10000 : value);

// Paramètre en RAM, valeur usine s'il n'a jamais été écrit
const Param = (device: SimulatedDevice, address: number): number =>
    device.has(ModbusTable.HOLDING, address) ? device.get(ModbusTable.HOLDING, address) : FACTORY_DEFAULTS[address] ?? 0;

/** État du moteur vu par le capteur simulé : fréquence de sortie / fréquence max (0.01 Hz) */
export interface PidProcess {
    outputFrequency: number;
    maxFrequency: number;
}

interface PidGains {
    sign: number;
    kp: number;
    ti: number;
    td: number;
    isDerivativeOnFeedback: boolean;
}

/**
 * PID du Veichi SI23 (unités 0.1 %) : consigne F11.00 / retour F11.03 (clavier F11.01, AI1, AI2 ou communication
 * 0x2008 / 0x2009), AI mises à l'échelle par F03.00-F03.09 (droite uniquement, F03.19 ignoré), retour × F11.05,
 * caractéristique F11.07, sortie = Kp × (e + ∫e/Ti + Td × de/dt) (F11.11-F11.13) bornée par F11.23 / F11.22
 * (% de F00.09) avec anti-emballement de l'intégrale, coupure du retour F11.25-F11.28.
 * Capteur simulé si sa tension n'est pas forcée : process ∝ (f / F00.09)² sur la plage F03 (tension basse -> haute).
 */
export class InverterPid {
    // Sortie (0.1 %), terme intégral (0.1 %), dernières mesures pour la dérivée, durée de coupure : volatiles
    private _output = 0;
    private _integral = 0;
    private _lastError?: number;
    private _lastFeedback?: number;
    private _breakMs = 0;
    private isFaulted = false;

    public get output(): number {
        return this._output;
    }

    // Défaut E.PId (F11.26 = 1) : arrêt jusqu'au réarmement
    public get hasFault(): boolean {
        return this.isFaulted;
    }

    public clearFault(): void {
        this.isFaulted = false;
    }

    // Fréquence demandée (0.01 Hz) : sortie PID (0.1 %) de la fréquence max
    public frequency(process: PidProcess): number {
        return Math.round(this._output * process.maxFrequency / 1000);
    }

    // Régulation tant que le variateur tourne en mode PID, sinon remise à zéro (redémarrage sans à-coup)
    public update(device: SimulatedDevice, dtMs: number, process: PidProcess, isActive: boolean): void {
        if (isActive) {
            this.tick(device, dtMs, process);
        } else {
            this.reset();
        }
    }

    // C00.08 / C00.09 (0 hors mode PID) et C00.16 / C00.17
    public monitoring(device: SimulatedDevice, process: PidProcess, isActive: boolean): Record<number, number> {
        return {
            [PID_REFERENCE_OFFSET]: isActive ? this._display(device, this.reference(device, process)) : 0,
            [PID_FEEDBACK_OFFSET]: isActive ? this._display(device, this.feedback(device, process)) : 0,
            [AI_OFFSETS[0]]: this.analogInput(device, 0, process),
            [AI_OFFSETS[1]]: this.analogInput(device, 1, process)
        };
    }

    public reset(): void {
        this._output = 0;
        this._integral = 0;
        this._lastError = undefined;
        this._lastFeedback = undefined;
        this._breakMs = 0;
    }

    // Affichage C00.08 / C00.09 sur la plage F11.06
    private _display(device: SimulatedDevice, value: number): number {
        return Math.round(value * Param(device, PID_RANGE) / 1000);
    }

    public reference(device: SimulatedDevice, process: PidProcess): number {
        return this._sourceValue(device, Param(device, PID_REFERENCE_SOURCE), PID_REFERENCE_COMMAND, process);
    }

    public feedback(device: SimulatedDevice, process: PidProcess): number {
        const feedback = this._sourceValue(device, Param(device, PID_FEEDBACK_SOURCE), PID_FEEDBACK_COMMAND, process);
        return feedback * Param(device, PID_FEEDBACK_GAIN) / 100;
    }

    // Tension de l'entrée AIn (mV) : forcée (C00.16 / C00.17) ou capteur simulé
    public analogInput(device: SimulatedDevice, index: number, process: PidProcess): number {
        const register = MONITORING_START + AI_OFFSETS[index];
        const forced = device.has(ModbusTable.HOLDING, register) ? device.get(ModbusTable.HOLDING, register) : AI_RELEASE;
        if (forced !== AI_RELEASE) {
            return forced;
        }
        const [lowVoltage, , highVoltage] = this._scaling(device, index);
        const ratio = Math.min(1, process.outputFrequency / process.maxFrequency) ** 2;
        return Math.round((lowVoltage + ratio * (highVoltage - lowVoltage)) * 10);
    }

    public tick(device: SimulatedDevice, dtMs: number, process: PidProcess): void {
        const feedback = this.feedback(device, process);
        if (this._checkBreak(device, feedback, dtMs)) {
            return;
        }
        const gains = this._gains(device);
        const error = gains.sign * (this.reference(device, process) - feedback);
        const derivative = this._derivative(gains, error, feedback, dtMs / 1000);
        this._lastError = error;
        this._lastFeedback = feedback;
        this._integral = gains.ti > 0 ? this._integral + error * (dtMs / 1000) / gains.ti : 0;
        const min = Param(device, PID_OUTPUT_MIN);
        const max = Math.max(min, Param(device, PID_OUTPUT_MAX));
        const raw = gains.kp * (error + this._integral + gains.td * derivative);
        this._output = Math.min(max, Math.max(min, raw));
        if (raw !== this._output && gains.kp > 0 && gains.ti > 0) {
            this._integral = this._output / gains.kp - error - gains.td * derivative;
        }
    }

    private _gains(device: SimulatedDevice): PidGains {
        const control = Param(device, PID_CONTROL);
        return {
            sign: (control & 0xF) === 1 ? -1 : 1,
            kp: Param(device, PID_PROPORTIONAL) / 1000,
            ti: Param(device, PID_INTEGRAL) / 10,
            td: Param(device, PID_DERIVATIVE) / 1000,
            isDerivativeOnFeedback: ((control >> 12) & 0xF) === 1
        };
    }

    private _derivative(gains: PidGains, error: number, feedback: number, dt: number): number {
        if (dt <= 0 || gains.td <= 0) {
            return 0;
        }
        return gains.isDerivativeOnFeedback
            ? -gains.sign * (feedback - (this._lastFeedback ?? feedback)) / dt
            : (error - (this._lastError ?? error)) / dt;
    }

    // Coupure du retour : hors [F11.28, F11.27] pendant F11.25 => action F11.26 ; true = sortie PID figée
    private _checkBreak(device: SimulatedDevice, feedback: number, dtMs: number): boolean {
        const isOut = feedback > Param(device, PID_BREAK_HIGH) || feedback < Param(device, PID_BREAK_LOW);
        this._breakMs = isOut ? this._breakMs + dtMs : 0;
        if (!isOut || this._breakMs < Param(device, PID_BREAK_TIME) * 100) {
            return false;
        }
        const action = Param(device, PID_BREAK_ACTION);
        if (action === PID_BREAK_FAULT) {
            this.isFaulted = true;
            this.reset();
            return true;
        }
        return action === PID_BREAK_FREEZE;
    }

    private _scaling(device: SimulatedDevice, index: number): [number, number, number, number] {
        const base = AI_SCALING[index];
        return [Param(device, base), ToInt16(Param(device, base + 1)), Param(device, base + 2), ToInt16(Param(device, base + 3))];
    }

    // AIn mise à l'échelle F03 (droite), en 0.1 % ; tension saturée sur [tension basse, tension haute]
    private _analogPercent(device: SimulatedDevice, index: number, process: PidProcess): number {
        const [lowVoltage, lowPercent, highVoltage, highPercent] = this._scaling(device, index);
        if (highVoltage <= lowVoltage) {
            return lowPercent / 10;
        }
        const voltage = Math.min(highVoltage, Math.max(lowVoltage, this.analogInput(device, index, process) / 10));
        return (lowPercent + (voltage - lowVoltage) / (highVoltage - lowVoltage) * (highPercent - lowPercent)) / 10;
    }

    // Valeur d'une source PID (enum pidSource) en 0.1 % ; sources non simulées (PUL, carte option...) = 0
    private _sourceValue(device: SimulatedDevice, source: number, commandRegister: number, process: PidProcess): number {
        switch (source) {
            case PID_SOURCE_KEYPAD:
                return Param(device, PID_KEYPAD_REFERENCE);
            case PID_SOURCE_AI1:
                return this._analogPercent(device, 0, process);
            case PID_SOURCE_AI2:
                return this._analogPercent(device, 1, process);
            case PID_SOURCE_COMM:
                return ToInt16(device.get(ModbusTable.HOLDING, commandRegister));
            default:
                return 0;
        }
    }
}
