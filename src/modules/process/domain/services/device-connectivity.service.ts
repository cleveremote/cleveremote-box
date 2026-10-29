import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { SocketIoClientProxyService } from 'src/common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { DeviceConnectivityModel, DeviceModel, DeviceType, SlaveConfigModel } from '../models/device.model';
import { ModbusDeviceService } from './modbus-device.service';

const MASTER_UNREACHABLE = 'master unreachable';
const MASTER_NOT_FOUND = 'master not found';

/**
 * Connectivité des devices MASTER / SLAVE : vérifiée périodiquement (watch) ou à la demande,
 * persistée sur le device (champ `connectivity`) et poussée au front uniquement quand elle change
 * (pas d'écriture en base à chaque vérification).
 */
@Injectable()
export class DeviceConnectivityService {
    private _isWatching = false;

    public constructor(
        private deviceRepository: DeviceRepository,
        private modbusDeviceService: ModbusDeviceService,
        private wsService: SocketIoClientProxyService,
        private readonly logger: Logger
    ) { }

    /**
     * Vérifie un device : un MASTER entraîne la vérification de ses slaves, un SLAVE celle de son
     * master d'abord. Un slave n'est jamais sondé derrière un master injoignable (marqué déconnecté,
     * pour ne pas empiler des timeouts sur le bus). Renvoie les états mis à jour.
     */
    public async checkConnectivity(deviceId: string): Promise<DeviceConnectivityModel[]> {
        const device = await this.deviceRepository.get(deviceId) as DeviceModel | null;
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        if (device.type === DeviceType.MASTER) {
            return this._checkMaster(device);
        }
        const master = await this.deviceRepository.get((device.config as SlaveConfigModel).masterDeviceId) as DeviceModel | null;
        if (!master) {
            return [await this._update(device, false, MASTER_NOT_FOUND)];
        }
        const masterState = await this._probeMaster(master);
        return [masterState.connected
            ? await this._checkSlave(device, master)
            : await this._update(device, false, MASTER_UNREACHABLE)];
    }

    /** Vérifie tous les masters (et leurs slaves) ; les slaves orphelins sont marqués déconnectés */
    public async checkAll(): Promise<DeviceConnectivityModel[]> {
        const masters = await this.deviceRepository.getByType(DeviceType.MASTER);
        const states: DeviceConnectivityModel[] = [];
        for (const master of masters) {
            states.push(...await this._checkMaster(master));
        }
        const masterIds = new Set(masters.map((master) => master._id));
        const orphans = (await this.deviceRepository.getByType(DeviceType.SLAVE))
            .filter((slave) => !masterIds.has((slave.config as SlaveConfigModel).masterDeviceId));
        for (const orphan of orphans) {
            states.push(await this._update(orphan, false, MASTER_NOT_FOUND));
        }
        return states;
    }

    // setTimeout auto-replanifié (jamais de setInterval) : le prochain tick n'est planifié qu'une
    // fois le précédent terminé, pour ne jamais empiler deux vérifications sur le bus.
    public watch(intervalMs = 30000): void {
        if (this._isWatching) {
            return;
        }
        this._isWatching = true;
        const tick = async (): Promise<void> => {
            try {
                await this.checkAll();
            } catch (err) {
                this.logger.warn({ err: this._getErrorMessage(err) }, 'device connectivity check failed');
            }
            setTimeout(() => void tick(), intervalMs);
        };
        void tick();
    }

    private async _checkMaster(master: DeviceModel): Promise<DeviceConnectivityModel[]> {
        const masterState = await this._probeMaster(master);
        const slaves = await this.deviceRepository.getSlavesByMasterId(master._id);
        const states = [masterState];
        for (const slave of slaves) {
            states.push(masterState.connected
                ? await this._checkSlave(slave, master)
                : await this._update(slave, false, MASTER_UNREACHABLE));
        }
        return states;
    }

    private _probeMaster(master: DeviceModel): Promise<DeviceConnectivityModel> {
        return this._probe(master, () => this.modbusDeviceService.checkMaster(master));
    }

    private _checkSlave(slave: DeviceModel, master: DeviceModel): Promise<DeviceConnectivityModel> {
        return this._probe(slave, () => this.modbusDeviceService.checkSlave(slave, master));
    }

    private async _probe(device: DeviceModel, check: () => Promise<void>): Promise<DeviceConnectivityModel> {
        try {
            await check();
            return await this._update(device, true);
        } catch (err) {
            return this._update(device, false, this._getErrorMessage(err));
        }
    }

    // les erreurs de modbus-serial (TransactionTimedOutError, PortNotOpenError...) ne sont pas des
    // instances d'Error : String(err) donnerait "[object Object]", on lit leur `message` directement
    private _getErrorMessage(err: unknown): string {
        const message = (err as { message?: unknown })?.message;
        if (typeof message === 'string' && message) {
            return message;
        }
        if (typeof err === 'string') {
            return err;
        }
        try {
            return JSON.stringify(err) ?? String(err);
        } catch {
            return String(err);
        }
    }

    // état précédent = celui lu en base avec le device : écriture en base et push websocket seulement
    // au premier check ou quand `connected` / `error` change, l'état persisté est renvoyé tel quel sinon.
    // Un échec d'écriture en base n'interrompt pas la vérification.
    private async _update(device: DeviceModel, connected: boolean, error?: string): Promise<DeviceConnectivityModel> {
        const previous = device.connectivity;
        if (previous?.connected === connected && previous?.error === error) {
            return previous;
        }
        const state = new DeviceConnectivityModel();
        state.deviceId = device._id;
        state.connected = connected;
        state.changedAt = new Date();
        state.error = error;
        device.connectivity = state;

        try {
            await this.deviceRepository.updateConnectivity(device._id, state);
        } catch (err) {
            this.logger.warn({ deviceId: device._id, err: this._getErrorMessage(err) }, 'device connectivity save failed');
        }
        this.logger.log({ deviceId: device._id, connected, error }, 'device connectivity changed');
        this._emit(state);
        return state;
    }

    private _emit(state: DeviceConnectivityModel): void {
        const packet = { pattern: 'agg/synchronize/device-status', data: JSON.stringify(state) };
        this.wsService.sendMessage(packet, true)
            .catch((err) => this.logger.warn({ err }, 'failed to send device status (local)'));
        this.wsService.sendMessage(packet, false)
            .catch((err) => this.logger.warn({ err }, 'failed to send device status (remote)'));
    }
}
