import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Observable, Subject, Subscription } from 'rxjs';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { RegisterFunction, RegisterMapTemplate } from '@register-map/domain/models/register-map.model';
import { DeviceModel, DeviceType, SlaveConfigModel } from '../models/device.model';
import { DeviceCommandService } from './device-command.service';

const DEVICES_REFRESH_MS = 30000;

export enum DigitalIoDirection {
    INPUT = 'INPUT',
    OUTPUT = 'OUTPUT'
}

export interface DigitalIoChange {
    deviceId: string;
    // Index 0-based de la voie (même convention que ComActuatorActionConfig.channel)
    channel: number;
    previous: boolean;
    current: boolean;
}

export interface DigitalInputLongPress {
    deviceId: string;
    channel: number;
    heldMs: number;
}

// Bloc de bits lisible d'une register map : discrete inputs (entrées) ou coils (sorties)
interface DigitalBlock {
    direction: DigitalIoDirection;
    blockId: string;
    operationId: string;
}

interface WatchedDevice {
    deviceId: string;
    blocks: DigitalBlock[];
}

// État par device/bloc entre deux lectures ; pressStartedAt/longPressFired : entrées uniquement
interface BlockState {
    states: boolean[];
    pressStartedAt: (number | null)[];
    longPressFired: boolean[];
}

/**
 * Surveillance des E/S digitales de tous les slaves dont la register map expose un bloc de discrete inputs
 * (entrées) ou de coils (sorties) lisible : lecture périodique via la register map (file unique du bus,
 * cf. ModbusBusService) et émission d'un événement par voie qui change d'état, plus l'appui long sur
 * les entrées. La première lecture d'un bloc sert de référence et n'émet rien.
 */
@Injectable()
export class DigitalIoMonitorService {
    private readonly _inputChanges = new Subject<DigitalIoChange>();
    private readonly _inputLongPress = new Subject<DigitalInputLongPress>();
    private readonly _outputChanges = new Subject<DigitalIoChange>();
    private readonly _blockStates = new Map<string, BlockState>();
    private _devices: WatchedDevice[] = [];
    private _devicesRefreshedAt: number | null = null;
    private _isWatching = false;
    private _timer: NodeJS.Timeout | null = null;
    private _deviceChanges: Subscription | null = null;
    private _releaseBeforeDelete: (() => void) | null = null;
    private _inFlightRead: Promise<void> | null = null;

    public readonly inputChanges$: Observable<DigitalIoChange> = this._inputChanges.asObservable();
    public readonly inputLongPress$: Observable<DigitalInputLongPress> = this._inputLongPress.asObservable();
    public readonly outputChanges$: Observable<DigitalIoChange> = this._outputChanges.asObservable();

    public constructor(
        private readonly deviceRepository: DeviceRepository,
        private readonly deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    // setTimeout auto-replanifié (jamais de setInterval) : le prochain poll n'est planifié qu'une
    // fois le précédent terminé, pour ne jamais empiler de lectures sur le bus si un slave répond lentement.
    public watch(intervalMs = 500, longPressMs = 5000): void {
        if (this._isWatching) {
            return;
        }
        this._isWatching = true;
        this._deviceChanges = this.deviceRepository.changes$.subscribe((deviceId) => this._onDeviceChanged(deviceId));
        // suppression d'un device : reset d'adresse seulement une fois la lecture en cours terminee
        this._releaseBeforeDelete = this.deviceRepository.onBeforeDelete(async () => { await this._inFlightRead; });
        const tick = async (): Promise<void> => {
            try {
                await this.poll(longPressMs);
            } catch (err) {
                this.logger.warn({ err: err?.message }, 'digital io monitor poll failed');
            }
            if (this._isWatching) {
                this._timer = setTimeout(() => void tick(), intervalMs);
            }
        };
        void tick();
    }

    public stop(): void {
        this._isWatching = false;
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        this._deviceChanges?.unsubscribe();
        this._deviceChanges = null;
        this._releaseBeforeDelete?.();
        this._releaseBeforeDelete = null;
        this._blockStates.clear();
        this._devicesRefreshedAt = null;
    }

    /** Un passage de lecture sur tous les slaves digitaux (liste rafraîchie au plus toutes les 30 s) */
    public async poll(longPressMs = 5000): Promise<void> {
        if (this._devicesRefreshedAt === null || Date.now() - this._devicesRefreshedAt >= DEVICES_REFRESH_MS) {
            await this._refreshDevices();
        }
        for (const device of this._devices) {
            for (const block of device.blocks) {
                // slave en cours de suppression : plus lu, son adresse va être réinitialisée
                if (this.deviceRepository.isPendingDeletion(device.deviceId)) break;
                this._inFlightRead = this._readBlock(device.deviceId, block, longPressMs);
                try {
                    await this._inFlightRead;
                } finally {
                    this._inFlightRead = null;
                }
            }
        }
    }

    // Device créé, modifié ou supprimé : liste rechargée au prochain poll et état du device oublié
    // (sa register map / son adresse ont pu changer : nouvelle référence à la prochaine lecture)
    private _onDeviceChanged(deviceId: string): void {
        this._devicesRefreshedAt = null;
        [...this._blockStates.keys()]
            .filter((key) => key.split('/')[0] === deviceId)
            .forEach((key) => this._blockStates.delete(key));
    }

    // Un slave marqué déconnecté n'est pas lu (pas de timeouts empilés sur le bus, cf. DeviceConnectivityService) ;
    // l'état d'un device qui disparaît de la liste est oublié (nouvelle référence à son retour)
    private async _refreshDevices(): Promise<void> {
        const slaves = await this.deviceRepository.getByType(DeviceType.SLAVE);
        this._devices = slaves
            .filter((slave) => slave.connectivity?.connected !== false && !this.deviceRepository.isPendingDeletion(slave._id))
            .map((slave) => ({ deviceId: slave._id, blocks: this._digitalBlocks(slave) }))
            .filter((device) => device.blocks.length > 0);
        this._devicesRefreshedAt = Date.now();

        const watchedIds = new Set(this._devices.map((device) => device.deviceId));
        [...this._blockStates.keys()]
            .filter((key) => !watchedIds.has(key.split('/')[0]))
            .forEach((key) => this._blockStates.delete(key));
    }

    private _digitalBlocks(slave: DeviceModel): DigitalBlock[] {
        const kind = (slave.config as SlaveConfigModel)?.kind;
        if (!kind) return [];
        let template: RegisterMapTemplate;
        try {
            template = this.deviceCommandService.getTemplate(kind);
        } catch {
            return [];
        }
        return template.registerMap.flatMap((block) => {
            const [direction, readFunction] = block.area === 'discreteInput'
                ? [DigitalIoDirection.INPUT, RegisterFunction.READ_DISCRETE_INPUTS]
                : block.area === 'coil' ? [DigitalIoDirection.OUTPUT, RegisterFunction.READ_COILS] : [];
            const operation = direction && block.operations.find((op) => op.function === readFunction);
            return operation ? [{ direction, blockId: block.id, operationId: operation.id }] : [];
        });
    }

    // Échec de lecture : loggé, état précédent conservé, aucun événement
    private async _readBlock(deviceId: string, block: DigitalBlock, longPressMs: number): Promise<void> {
        const states = await this._read(deviceId, block);
        if (!states) return;
        const key = `${deviceId}/${block.blockId}`;
        const previous = this._blockStates.get(key);
        if (!previous) {
            this._startBlock(key, deviceId, block, states);
            return;
        }

        const changes: DigitalIoChange[] = states
            .map((current, channel) => ({ deviceId, channel, previous: previous.states[channel] ?? false, current }))
            .filter((change) => change.current !== change.previous);
        previous.states = states;

        if (block.direction === DigitalIoDirection.INPUT) {
            this._detectLongPress(deviceId, previous, longPressMs);
        }
        if (changes.length === 0) return;

        const isInput = block.direction === DigitalIoDirection.INPUT;
        this.logger.log({ deviceId, blockId: block.blockId, changes, states }, `digital ${isInput ? 'input' : 'output'} state changed`);
        const subject = isInput ? this._inputChanges : this._outputChanges;
        changes.forEach((change) => subject.next(change));
    }

    // Première lecture d'un bloc : état de référence, aucun événement
    private _startBlock(key: string, deviceId: string, block: DigitalBlock, states: boolean[]): void {
        this._blockStates.set(key, {
            states,
            pressStartedAt: states.map((current) => (current ? Date.now() : null)),
            longPressFired: states.map(() => false)
        });
        this.logger.log({ deviceId, blockId: block.blockId, direction: block.direction, states }, 'digital io monitor started');
    }

    // États des voies triés par index ; undefined (warn) si la lecture échoue
    private async _read(deviceId: string, block: DigitalBlock): Promise<boolean[] | undefined> {
        try {
            const outcome = await this.deviceCommandService.executeOnDevice(deviceId, { blockId: block.blockId, operationId: block.operationId });
            if (outcome.isOk && outcome.value?.type === 'boolean[]') {
                return [...outcome.value.channels].sort((a, b) => a.index - b.index).map((c) => Boolean(c.value));
            }
            this.logger.warn({ deviceId, blockId: block.blockId, err: outcome.error?.message }, 'digital io monitor read failed');
        } catch (err) {
            this.logger.warn({ deviceId, blockId: block.blockId, err: err?.message }, 'digital io monitor read failed');
        }
        return undefined;
    }

    // Une voie restée à true sans interruption pendant au moins longPressMs déclenche l'événement une seule
    // fois par appui (pas à chaque poll une fois le seuil dépassé) ; réarmé au relâchement
    private _detectLongPress(deviceId: string, state: BlockState, longPressMs: number): void {
        const now = Date.now();
        state.states.forEach((current, channel) => {
            if (!current) {
                state.pressStartedAt[channel] = null;
                state.longPressFired[channel] = false;
                return;
            }
            const startedAt = state.pressStartedAt[channel] ??= now;
            if (!state.longPressFired[channel] && now - startedAt >= longPressMs) {
                state.longPressFired[channel] = true;
                const event: DigitalInputLongPress = { deviceId, channel, heldMs: now - startedAt };
                this.logger.log(event, 'digital input long press detected');
                this._inputLongPress.next(event);
            }
        });
    }
}
