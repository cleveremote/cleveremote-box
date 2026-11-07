import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AddressRange, DEVICE_KIND_SPECS, DeviceKind } from '@process/domain/models/device.model';
import { RegisterMapTemplate } from '@register-map/domain/models/register-map.model';
import { REGISTER_MAPS_DIR, RegisterMapLoader } from '@register-map/domain/services/register-map-loader.service';
import { CreateSimulationBehavior } from '../behaviors/behavior.registry';
import { MODBUS_TABLES, SimulatedDeviceState, SimulatedTables } from '../models/simulated-device.model';
import {
    DEFAULT_SIMULATOR_HOST, DEFAULT_SIMULATOR_PORT, DEFAULT_SIMULATOR_STATE_FILE, ParseSimulatedDevices, SimulatorConfig
} from '../models/simulator-config.model';
import { ModbusTcpServer } from './modbus-tcp-server';
import { SimulatedDevice, WordOrder } from './simulated-device';
import { SimulatorStateStore } from './simulator-state.store';

const TICK_MS = 1000;

// Ce qu'il faut savoir d'un kind pour le simuler
interface SimulatedKind {
    count: number;
    range: AddressRange;
    discoveryRegister: number;
    wordOrder: WordOrder;
}

/**
 * Passerelle Modbus TCP simulée (SIMULATOR_ENABLED=true) : les équipements de SIMULATOR_DEVICES y répondent comme des
 * modules neufs (adresse range.min de leur kind), sont détectés et réadressés par le scan d'un Master TCP qui la vise,
 * puis gardent leur adresse et leurs registres d'un redémarrage à l'autre (SIMULATOR_STATE_FILE).
 * Avec `KIND:n`, un seul module neuf à la fois sur range.min : le suivant apparaît quand le précédent est réadressé.
 */
@Injectable()
export class SimulatorService implements OnApplicationBootstrap, OnModuleDestroy {
    private _kinds = new Map<string, SimulatedKind>();
    // Équipements servis sur le bus
    private _devices: SimulatedDevice[] = [];
    // Équipements persistés d'un kind hors configuration (ou en surnombre) : conservés dans le fichier, non servis
    private _inactive: SimulatedDeviceState[] = [];
    private _server?: ModbusTcpServer;
    private _store?: SimulatorStateStore;
    private _tickTimer?: NodeJS.Timeout;

    public constructor(
        private readonly config: ConfigService,
        private readonly registerMapLoader: RegisterMapLoader,
        private readonly logger: Logger
    ) { }

    public async onApplicationBootstrap(): Promise<void> {
        if (this.config.get<string>('SIMULATOR_ENABLED') !== 'true') {
            this.logger.debug('simulator disabled');
            return;
        }
        const config = this._readConfig();
        this._kinds = this._resolveKinds(config);
        if (!this._kinds.size) {
            this.logger.warn({ devices: this.config.get<string>('SIMULATOR_DEVICES') }, 'simulator enabled without any simulable device');
            return;
        }
        this._store = new SimulatorStateStore(resolve(process.cwd(), config.stateFile), this.logger);
        this._restore(this._store.load());
        if (!await this._startServer(config)) {
            return;
        }
        this._startTick();
        this._save();
        this.logger.log({
            host: config.host, port: config.port, stateFile: config.stateFile,
            devices: this._devices.map((device) => `${device.kind}@${device.unitId}`)
        }, 'simulator listening');
    }

    public async onModuleDestroy(): Promise<void> {
        clearInterval(this._tickTimer);
        this._tickTimer = undefined;
        this._store?.flush();
        await this._server?.stop();
        this._server = undefined;
    }

    private async _startServer({ host, port }: SimulatorConfig): Promise<boolean> {
        const server = new ModbusTcpServer({
            resolve: (unitId) => this._devices.find((device) => device.unitId === unitId),
            onWrite: (device, isReaddressed) => this._onWrite(device, isReaddressed)
        }, this.logger);
        try {
            await server.start(host, port);
        } catch (err) {
            // Port déjà pris... : la box démarre quand même, sans simulateur
            this.logger.error({ host, port, err: err instanceof Error ? err.message : String(err) }, 'simulator not started');
            return false;
        }
        this._server = server;
        return true;
    }

    private _startTick(): void {
        let lastTick = Date.now();
        this._tickTimer = setInterval(() => {
            const now = Date.now();
            this._devices.forEach((device) => device.tick(now - lastTick));
            lastTick = now;
        }, TICK_MS);
        this._tickTimer.unref?.();
    }

    private _readConfig(): SimulatorConfig {
        const { devices, invalid } = ParseSimulatedDevices(this.config.get<string>('SIMULATOR_DEVICES'));
        if (invalid.length) {
            this.logger.warn({ invalid }, 'SIMULATOR_DEVICES entries ignored (expected KIND[:count])');
        }
        const port = Number(this.config.get<string>('SIMULATOR_PORT') ?? DEFAULT_SIMULATOR_PORT);
        return {
            host: this.config.get<string>('SIMULATOR_HOST') || DEFAULT_SIMULATOR_HOST,
            port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_SIMULATOR_PORT,
            stateFile: this.config.get<string>('SIMULATOR_STATE_FILE') || DEFAULT_SIMULATOR_STATE_FILE,
            devices
        };
    }

    // Kinds simulables : plage et registre de découverte (DEVICE_KIND_SPECS) et register map livrée
    private _resolveKinds(config: SimulatorConfig): Map<string, SimulatedKind> {
        const templates = this.registerMapLoader.loadFromDirectory(join(process.cwd(), REGISTER_MAPS_DIR));
        const kinds = new Map<string, SimulatedKind>();
        for (const { kind, count } of config.devices) {
            const simulated = this._resolveKind(kind, count, templates);
            if (simulated) {
                kinds.set(kind, simulated);
            }
        }
        return kinds;
    }

    private _resolveKind(kind: string, count: number, templates: RegisterMapTemplate[]): SimulatedKind | undefined {
        if (!(kind in DEVICE_KIND_SPECS)) {
            this.logger.warn({ kind, known: Object.values(DeviceKind) }, 'simulated kind unknown, ignored');
            return undefined;
        }
        const spec = DEVICE_KIND_SPECS[kind as DeviceKind];
        if (spec?.discoveryRegister === undefined) {
            this.logger.warn({ kind }, 'simulated kind not detectable (no discovery register), ignored');
            return undefined;
        }
        const template = templates.find((t) => t.kind === kind);
        if (!template) {
            this.logger.warn({ kind }, 'simulated kind without register map, ignored');
            return undefined;
        }
        return { count, range: spec.range, discoveryRegister: spec.discoveryRegister, wordOrder: template.hardware.wordOrder ?? 'highFirst' };
    }

    // Reprend les équipements persistés (dans la limite du nombre voulu par kind), puis branche un module neuf par kind incomplet
    private _restore(states: SimulatedDeviceState[]): void {
        const activeCount = new Map<string, number>();
        for (const state of states) {
            const kind = this._kinds.get(state.kind);
            const count = activeCount.get(state.kind) ?? 0;
            if (!kind || count >= kind.count) {
                this._inactive.push(state);
                continue;
            }
            activeCount.set(state.kind, count + 1);
            this._devices.push(this._createDevice(state));
        }
        this._kinds.forEach((_, kind) => this._plugFresh(kind));
    }

    // Module neuf sur range.min si le kind n'a pas tous ses exemplaires et que l'adresse est libre
    private _plugFresh(kind: string): void {
        const spec = this._kinds.get(kind);
        const active = this._devices.filter((device) => device.kind === kind).length;
        if (!spec || active >= spec.count || this._devices.some((device) => device.unitId === spec.range.min)) {
            return;
        }
        const tables = MODBUS_TABLES.reduce((acc, table) => ({ ...acc, [table]: {} }), {} as SimulatedTables);
        const device = this._createDevice({ id: randomUUID(), kind, unitId: spec.range.min, tables });
        this._devices.push(device);
        this.logger.log({ kind, unitId: device.unitId }, 'simulated device plugged');
    }

    private _createDevice(state: SimulatedDeviceState): SimulatedDevice {
        const spec = this._kinds.get(state.kind);
        return new SimulatedDevice(state, spec.discoveryRegister, spec.wordOrder, CreateSimulationBehavior(state.kind));
    }

    private _onWrite(device: SimulatedDevice, isReaddressed: boolean): void {
        if (isReaddressed) {
            // Réadressé sur une adresse occupée (ex: remis sur range.min par resetSlaveAddress alors qu'un module neuf
            // y attendait) : le module neuf est débranché, il réapparaîtra quand l'adresse se libérera
            const others = this._devices.filter((other) => other !== device && other.unitId === device.unitId);
            if (others.length) {
                this._devices = this._devices.filter((other) => !others.includes(other));
                const unplugged = others.map((other) => other.kind);
                this.logger.log({ unitId: device.unitId, unplugged }, 'simulated device unplugged (address conflict)');
            }
            this._kinds.forEach((_, kind) => this._plugFresh(kind));
        }
        this._save();
    }

    private _save(): void {
        this._store?.scheduleSave(() => [...this._devices.map((device) => device.toState()), ...this._inactive]);
    }
}
