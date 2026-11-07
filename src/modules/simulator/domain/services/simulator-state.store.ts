import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Logger } from 'nestjs-pino';
import { SimulatedDeviceState, SimulatorState } from '../models/simulated-device.model';

// Regroupe les écritures rapprochées (ex: scan + réadressage) en une seule sauvegarde
const SAVE_DEBOUNCE_MS = 500;

/** État persistant du simulateur (adresses et registres écrits) dans un fichier JSON */
export class SimulatorStateStore {
    private _timer?: NodeJS.Timeout;
    private _pending?: () => SimulatedDeviceState[];

    public constructor(private readonly path: string, private readonly logger: Logger) { }

    /** État enregistré ; fichier absent ou illisible = aucun équipement (tous repartent neufs) */
    public load(): SimulatedDeviceState[] {
        if (!existsSync(this.path)) {
            return [];
        }
        try {
            const state = JSON.parse(readFileSync(this.path, 'utf8')) as SimulatorState;
            return Array.isArray(state?.devices) ? state.devices : [];
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn({ path: this.path, err: message }, 'simulator state not readable, starting fresh');
            return [];
        }
    }

    /** Sauvegarde différée : `snapshot` est évalué au moment de l'écriture */
    public scheduleSave(snapshot: () => SimulatedDeviceState[]): void {
        this._pending = snapshot;
        if (this._timer) {
            return;
        }
        this._timer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
        this._timer.unref?.();
    }

    /** Écrit la sauvegarde en attente, s'il y en a une (écriture atomique : fichier temporaire puis renommage) */
    public flush(): void {
        clearTimeout(this._timer);
        this._timer = undefined;
        const snapshot = this._pending;
        this._pending = undefined;
        if (!snapshot) {
            return;
        }
        const state: SimulatorState = { devices: snapshot() };
        const tmpPath = `${this.path}.tmp`;
        try {
            writeFileSync(tmpPath, JSON.stringify(state, null, 2));
            renameSync(tmpPath, this.path);
        } catch (err) {
            this.logger.error({ path: this.path, err: err instanceof Error ? err.message : String(err) }, 'simulator state save failed');
        }
    }
}
