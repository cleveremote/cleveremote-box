import { ModbusExceptionCode, ModbusExceptionError, ModbusTable } from '../models/simulated-device.model';
import { SimulatedDevice } from '../services/simulated-device';
import { SimulationBehavior } from './behavior.interface';

// Adresses de waveshare-modbus-rtu-io-8ch.json (coils)
const CHANNELS = 8;
const ALL_OUTPUTS = 0x00FF;
const FLASH_ON_START = 0x0200;
const FLASH_OFF_START = 0x0400;
// Valeurs FC05
const COIL_ON = 0xFF00;
const COIL_OFF = 0x0000;
const COIL_TOGGLE = 0x5500;
// Durée des flashs : valeur × 100 ms
const FLASH_UNIT_MS = 100;

/**
 * Module Waveshare IO 8CH : sorties (coils 0-7) pilotées en FC05 (ON / OFF / toggle 0x5500) ou FC15, toutes les sorties
 * via la coil 0xFF, impulsions flashOn/flashOff (coils 0x200+ / 0x400+). Les entrées (FC02) recopient les sorties.
 */
export class DigitalIoBehavior implements SimulationBehavior {
    // Fin des impulsions en cours, par voie : état à rétablir à l'échéance
    private readonly _pulses = new Map<number, { remainingMs: number; restore: number }>();

    public onRead(device: SimulatedDevice, table: ModbusTable, address: number): number | undefined {
        if (table === ModbusTable.DISCRETE_INPUTS && address < CHANNELS) {
            return device.get(ModbusTable.COILS, address);
        }
        return undefined;
    }

    public onWrite(device: SimulatedDevice, table: ModbusTable, address: number, value: number): boolean {
        if (table !== ModbusTable.COILS) {
            return false;
        }
        if (address < CHANNELS || address === ALL_OUTPUTS) {
            const channels = address === ALL_OUTPUTS ? [...Array(CHANNELS).keys()] : [address];
            channels.forEach((channel) => {
                this._pulses.delete(channel);
                this._apply(device, channel, value);
            });
            return true;
        }
        return this._startPulse(device, address, value);
    }

    public tick(device: SimulatedDevice, dtMs: number): void {
        for (const [channel, pulse] of this._pulses) {
            pulse.remainingMs -= dtMs;
            if (pulse.remainingMs <= 0) {
                device.set(ModbusTable.COILS, channel, pulse.restore);
                this._pulses.delete(channel);
            }
        }
    }

    // flashOn (0x200+voie) : sortie ON pendant value × 100 ms puis OFF ; flashOff (0x400+voie) : l'inverse
    private _startPulse(device: SimulatedDevice, address: number, value: number): boolean {
        const isFlashOn = address >= FLASH_ON_START && address < FLASH_ON_START + CHANNELS;
        const isFlashOff = address >= FLASH_OFF_START && address < FLASH_OFF_START + CHANNELS;
        if (!isFlashOn && !isFlashOff) {
            return false;
        }
        const channel = address - (isFlashOn ? FLASH_ON_START : FLASH_OFF_START);
        device.set(ModbusTable.COILS, channel, isFlashOn ? 1 : 0);
        this._pulses.set(channel, { remainingMs: value * FLASH_UNIT_MS, restore: isFlashOn ? 0 : 1 });
        return true;
    }

    // Valeur FC05 brute (ON / OFF / toggle) ou bit FC15 (1 / 0)
    private _apply(device: SimulatedDevice, channel: number, value: number): void {
        const current = device.get(ModbusTable.COILS, channel);
        switch (value) {
            case COIL_ON:
            case 1:
                device.set(ModbusTable.COILS, channel, 1);
                return;
            case COIL_OFF:
                device.set(ModbusTable.COILS, channel, 0);
                return;
            case COIL_TOGGLE:
                device.set(ModbusTable.COILS, channel, current ? 0 : 1);
                return;
            default:
                throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE, `valeur de coil ${value} non supportée`);
        }
    }
}
