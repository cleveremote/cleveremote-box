// Kind simulé par défaut quand SIMULATOR_DEVICES est absent
export const DEFAULT_SIMULATED_DEVICES = 'INVERTER_VEICHI_SI23_V1';
export const DEFAULT_SIMULATOR_HOST = '127.0.0.1';
export const DEFAULT_SIMULATOR_PORT = 5020;
export const DEFAULT_SIMULATOR_STATE_FILE = 'simulator-state.json';

/** Un type d'équipement à simuler et le nombre d'exemplaires voulus */
export interface SimulatedKindConfig {
    kind: string;
    count: number;
}

export interface SimulatorConfig {
    host: string;
    port: number;
    stateFile: string;
    devices: SimulatedKindConfig[];
}

/**
 * Parse SIMULATOR_DEVICES : `KIND[:nombre]` séparés par des virgules (ex: `INVERTER_VEICHI_SI23_V1:2,DIGITAL_IO_8CH`).
 * Un kind répété cumule ses nombres ; une entrée mal formée est renvoyée dans `invalid`.
 */
export function ParseSimulatedDevices(value: string | undefined): { devices: SimulatedKindConfig[]; invalid: string[] } {
    const counts = new Map<string, number>();
    const invalid: string[] = [];
    for (const entry of (value ?? DEFAULT_SIMULATED_DEVICES).split(',').map((e) => e.trim()).filter(Boolean)) {
        const [kind, rawCount, ...rest] = entry.split(':').map((part) => part.trim());
        const count = rawCount === undefined ? 1 : Number(rawCount);
        if (!kind || rest.length || !Number.isInteger(count) || count < 1) {
            invalid.push(entry);
            continue;
        }
        counts.set(kind, (counts.get(kind) ?? 0) + count);
    }
    return { devices: [...counts].map(([kind, count]) => ({ kind, count })), invalid };
}
