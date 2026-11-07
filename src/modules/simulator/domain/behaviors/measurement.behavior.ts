import { ModbusTable } from '../models/simulated-device.model';
import { SimulatedDevice, WordOrder } from '../services/simulated-device';
import { SimulationBehavior } from './behavior.interface';

// Codage d'un champ, comme dans les register maps (32 bits : ordre des mots = hardware.wordOrder)
export type FieldEncoding = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float';

/** Registre(s) qui reçoivent la valeur d'un signal */
export interface SignalTarget {
    table: ModbusTable;
    address: number;
    encoding: FieldEncoding;
    // raw = valeur / scale (ex: formula `raw / 10` -> scale 0.1) ; défaut 1
    scale?: number;
    // Partie de la valeur codée : entière, fractionnaire (float), centièmes (uint16) ; défaut : la valeur entière
    part?: 'integer' | 'fraction' | 'hundredths';
}

/** Grandeur simulée : marche aléatoire bornée (walk) ou totalisateur croissant (counter, `rate` unités/s) */
export interface MeasurementSignal {
    kind: 'walk' | 'counter';
    min: number;
    max: number;
    rate?: number;
    targets: SignalTarget[];
}

export interface StaticRegister {
    table: ModbusTable;
    address: number;
    value: number;
}

export interface MeasurementProfile {
    // Registres de configuration posés à la création (unité, décimales, gamme...) ; une écriture du client les remplace
    statics?: StaticRegister[];
    signals: MeasurementSignal[];
}

// Pas de la marche aléatoire, en fraction de la plage, par seconde
const WALK_STEP_RATIO = 0.02;

/** Mesures d'un capteur ou d'un module d'entrées : valeurs plausibles qui évoluent à chaque tick */
export class MeasurementBehavior implements SimulationBehavior {
    private readonly _values: number[];

    public constructor(private readonly profile: MeasurementProfile) {
        this._values = profile.signals.map((signal) => (signal.kind === 'counter' ? signal.min : (signal.min + signal.max) / 2));
    }

    public initialize(device: SimulatedDevice): void {
        (this.profile.statics ?? []).forEach(({ table, address, value }) => device.setIfAbsent(table, address, value));
        this.profile.signals.forEach((signal, i) => this._publish(device, signal, this._values[i]));
    }

    public tick(device: SimulatedDevice, dtMs: number): void {
        const seconds = dtMs / 1000;
        this.profile.signals.forEach((signal, i) => {
            this._values[i] = signal.kind === 'counter'
                ? this._values[i] + (signal.rate ?? 0) * seconds
                : this._walk(this._values[i], signal, seconds);
            this._publish(device, signal, this._values[i]);
        });
    }

    private _walk(value: number, { min, max }: MeasurementSignal, seconds: number): number {
        const step = (max - min) * WALK_STEP_RATIO * seconds * (Math.random() * 2 - 1);
        return Math.min(max, Math.max(min, value + step));
    }

    private _publish(device: SimulatedDevice, signal: MeasurementSignal, value: number): void {
        signal.targets.forEach((target) => {
            EncodeField(this._part(value, target), target, device.wordOrder)
                .forEach((word, offset) => device.set(target.table, target.address + offset, word));
        });
    }

    private _part(value: number, { part }: SignalTarget): number {
        const integer = Math.trunc(value);
        switch (part) {
            case 'integer':
                return integer;
            case 'fraction':
                return value - integer;
            case 'hundredths':
                return Math.floor((value - integer) * 100);
            default:
                return value;
        }
    }
}

/** Mots 16 bits d'une valeur physique, selon le codage du champ (inverse du décodage de RegisterFieldDecoder) */
export function EncodeField(value: number, { encoding, scale }: Pick<SignalTarget, 'encoding' | 'scale'>, wordOrder: WordOrder): number[] {
    const raw = value / (scale ?? 1);
    switch (encoding) {
        case 'uint16':
            return [Math.min(0xFFFF, Math.max(0, Math.round(raw)))];
        case 'int16':
            return [Math.min(0x7FFF, Math.max(-0x8000, Math.round(raw))) & 0xFFFF];
        case 'uint32':
        case 'int32':
        case 'float': {
            const buffer = Buffer.alloc(4);
            if (encoding === 'float') {
                buffer.writeFloatBE(raw, 0);
            } else if (encoding === 'int32') {
                buffer.writeInt32BE(Math.min(0x7FFFFFFF, Math.max(-0x80000000, Math.round(raw))), 0);
            } else {
                buffer.writeUInt32BE(Math.min(0xFFFFFFFF, Math.max(0, Math.round(raw))), 0);
            }
            const [high, low] = [buffer.readUInt16BE(0), buffer.readUInt16BE(2)];
            return wordOrder === 'lowFirst' ? [low, high] : [high, low];
        }
    }
}
