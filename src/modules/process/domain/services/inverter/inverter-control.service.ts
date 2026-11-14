/* eslint-disable max-lines */
import { forwardRef, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Subject, Subscription } from 'rxjs';
import { InverterChange, InverterRepository } from '@process/infrastructure/repositories/inverter.repository';
import { InverterConfigParam } from '../../models/device-command.model';
import { InverterEventDetail, ProcessEventKind } from '../../models/event.model';
import {
    InverterDirective, InverterMode, InverterModel, InverterRole, InverterRuntimeState
} from '../../models/inverter.model';
import { SensorValueModel } from '../../models/sensor-value.model';
import { ProcessValueModel } from '../../models/proccess-value.model';
import { DeviceCommandService } from '../device-command.service';
import { TriggerService } from '../trigger.service';
import { InverterProfile, InverterModeWrite } from './profiles/inverter-profile.interface';
import { ResolveInverterProfile } from './profiles/inverter-profile.resolver';

// lectures identiques consécutives de l'état des entrées X avant de changer d'état manuel / auto
const MANUAL_DEBOUNCE_READINGS = 2;

export type InverterEventKind =
    | ProcessEventKind.INVERTER_MODE_CHANGED
    | ProcessEventKind.INVERTER_MANUAL_ENGAGED
    | ProcessEventKind.INVERTER_MANUAL_RELEASED
    | ProcessEventKind.INVERTER_DIRECTIVE_IGNORED;

export interface InverterControlEvent {
    kind: InverterEventKind;
    inverter: InverterModel;
    detail: InverterEventDetail;
}

// état exposé au front / à l'exécution
export interface InverterStatus {
    inverterId: string;
    isManual: boolean;
    mode?: InverterMode;
    ownerSequenceId?: string;
}

interface ManualReading {
    isManual: boolean;
    count: number;
}

/**
 * Pilotage des variateurs par les séquences : une séquence en cours donne sa directive (mode PID / RS485 et consigne),
 * sa fin rend la main au mode par défaut du variateur. Écritures en RAM, idempotentes (seules les différences avec ce
 * qui a été écrit sont envoyées), sérialisées par variateur.
 * Le mode manuel (switchs S1..S3) est détecté par le sensor des entrées X : aucune écriture tant qu'il dure.
 */
@Injectable()
export class InverterControlService implements OnModuleDestroy {
    public readonly events$ = new Subject<InverterControlEvent>();

    private readonly _inverters = new Map<string, InverterModel>();
    private readonly _states = new Map<string, InverterRuntimeState>();
    private readonly _releaseTimers = new Map<string, NodeJS.Timeout>();
    private readonly _manualReadings = new Map<string, ManualReading>();
    // écritures d'un variateur sérialisées (le bus est half-duplex et l'ordre setpoint -> mode compte)
    private readonly _queues = new Map<string, Promise<void>>();
    private _sensorSubscription?: Subscription;
    private _repositorySubscription?: Subscription;

    public constructor(
        private readonly deviceCommandService: DeviceCommandService,
        private readonly inverterRepository: InverterRepository,
        @Inject(forwardRef(() => TriggerService)) private readonly triggerService: TriggerService,
        private readonly logger: Logger
    ) { }

    public onModuleDestroy(): void {
        this._sensorSubscription?.unsubscribe();
        this._repositorySubscription?.unsubscribe();
        this._releaseTimers.forEach((timer) => clearTimeout(timer));
        this._releaseTimers.clear();
    }

    /**
     * Charge les variateurs, vérifie leurs paramètres (baseline : seuls ceux qui diffèrent sont réécrits) et les remet
     * dans leur mode par défaut, en tâche de fond (file du variateur : un variateur injoignable ne bloque pas le démarrage) ;
     * écoute ensuite leur sensor d'entrées X et les variateurs créés / supprimés (scan, sync).
     */
    public async load(): Promise<void> {
        this._sensorSubscription ??= this.triggerService.onElementValueChanged
            .subscribe((value) => this._onElementValue(value));
        const inverters = await this.inverterRepository.get() as InverterModel[];
        for (const inverter of inverters) {
            void this.applyBaseline(inverter._id, inverter);
            this.register(inverter);
        }
        this._repositorySubscription ??= this.inverterRepository.changes$
            .subscribe((change) => this._onRepositoryChange(change));
    }

    /** Ajoute (ou met à jour) un variateur piloté ; nouveau : remis dans son mode par défaut (en file, non attendu) */
    public register(inverter: InverterModel): void {
        const isNew = !this._inverters.has(inverter._id);
        this._inverters.set(inverter._id, inverter);
        if (isNew) {
            this._states.set(inverter._id, { isManual: false, applied: {} });
            void this._reconcile(inverter._id);
        }
    }

    public unregister(inverterId: string): void {
        this._clearReleaseTimer(inverterId);
        this._inverters.delete(inverterId);
        this._states.delete(inverterId);
        this._manualReadings.delete(inverterId);
    }

    public get(inverterId: string): InverterModel | undefined {
        return this._inverters.get(inverterId);
    }

    public isManual(inverterId: string): boolean {
        return this._states.get(inverterId)?.isManual ?? false;
    }

    public getStatus(inverterId: string): InverterStatus | undefined {
        const state = this._states.get(inverterId);
        const inverter = this._inverters.get(inverterId);
        if (!state || !inverter) return undefined;
        return {
            inverterId, isManual: state.isManual, ownerSequenceId: state.ownerSequenceId,
            mode: state.directive?.mode ?? inverter.defaultMode
        };
    }

    /**
     * Directive d'une séquence qui démarre : elle devient propriétaire du variateur. En manuel, la directive est
     * retenue (appliquée au retour en auto si la séquence tourne encore) mais rien n'est écrit.
     */
    public async request(inverterId: string, directive: InverterDirective, sequenceId: string, sequenceName?: string): Promise<void> {
        const inverter = this._inverters.get(inverterId);
        const state = this._states.get(inverterId);
        if (!inverter || !state) {
            this.logger.warn({ inverterId, sequenceId }, 'inverter directive ignored (unknown inverter)');
            return;
        }
        this._clearReleaseTimer(inverterId);
        state.ownerSequenceId = sequenceId;
        state.directive = { ...directive };
        state.ownerSequenceName = sequenceName;
        if (state.isManual) {
            this._emit(ProcessEventKind.INVERTER_DIRECTIVE_IGNORED, inverter, this._detail(directive, sequenceId, sequenceName));
            return;
        }
        await this._reconcile(inverterId);
    }

    /**
     * Fin de la séquence propriétaire : retour au mode par défaut après releaseGraceMs (annulé si une séquence
     * reprend la main entre-temps, ex: passage à la séquence suivante). Séquence non propriétaire : ignoré.
     */
    public release(inverterId: string, sequenceId: string): void {
        const inverter = this._inverters.get(inverterId);
        const state = this._states.get(inverterId);
        if (!inverter || !state || state.ownerSequenceId !== sequenceId) return;
        this._clearReleaseTimer(inverterId);
        this._releaseTimers.set(inverterId, setTimeout(() => {
            this._releaseTimers.delete(inverterId);
            if (state.ownerSequenceId !== sequenceId) return;
            state.ownerSequenceId = undefined;
            state.ownerSequenceName = undefined;
            state.directive = undefined;
            void this._reconcile(inverterId);
        }, Math.max(0, inverter.releaseGraceMs ?? 0)));
    }

    /**
     * Paramètres imposés par l'élément (valeur renseignée) écrits en EEPROM, seulement s'ils diffèrent de la valeur
     * lue (pas d'usure inutile). Un échec est loggé sans interrompre les suivants.
     */
    public async applyBaseline(inverterId: string, model?: InverterModel): Promise<void> {
        const inverter = model ?? this._inverters.get(inverterId) ?? await this.inverterRepository.get(inverterId) as InverterModel;
        if (!inverter) return;
        await this._enqueue(inverterId, async () => {
            let written = 0;
            for (const parameter of inverter.parameters.filter((p) => p.value !== undefined)) {
                try {
                    const read = await this.deviceCommandService.execute(parameter.readCommandId, inverter.deviceId);
                    if (read.isOk && read.raw?.[0] === parameter.value) continue;
                    const outcome = await this.deviceCommandService.execute(parameter.setCommandId, inverter.deviceId,
                        { value: parameter.value, isPersistent: parameter.isPersistent, isConfirmed: true });
                    if (outcome.isOk) {
                        written++;
                    } else {
                        const error = outcome.error?.message;
                        this.logger.warn({ inverterId, blockId: parameter.blockId, error }, 'inverter parameter write failed');
                    }
                } catch (err) {
                    this.logger.warn({ inverterId, blockId: parameter.blockId, err: err.message }, 'inverter parameter skipped');
                }
            }
            this.logger.log({ inverterId, written }, 'inverter baseline applied');
        });
    }

    /**
     * Écrit des paramètres Fgg.ii d'un slave variateur via sa register map (bloc = code du paramètre, opération 'set',
     * persist = écriture EEPROM). Paramètre inconnu ou valeur hors plage : ignoré.
     */
    public async writeParameters(deviceId: string, params: InverterConfigParam[]): Promise<void> {
        for (const { param, value, persist: isPersistent } of params) {
            try {
                const outcome = await this.deviceCommandService.executeOnDevice(deviceId, {
                    blockId: param.toUpperCase(), operationId: 'set', value, isPersistent, isConfirmed: true
                });
                if (outcome.isOk) {
                    this.logger.log({ deviceId, param, value, persist: !!isPersistent }, 'inverter param written');
                }
            } catch (err) {
                this.logger.warn({ deviceId, param, err: err.message }, 'inverter param skipped');
            }
        }
    }

    // variateur créé (scan) ou modifié (sync) : paramètres vérifiés, modèle mis à jour ; supprimé : plus piloté
    private _onRepositoryChange(change: InverterChange): void {
        if (change.type === 'deleted') {
            this.unregister(change.id);
            return;
        }
        // création ou paramètres modifiés : seuls ceux qui diffèrent de l'appareil sont réécrits
        void this.applyBaseline(change.inverter._id, change.inverter);
        this.register(change.inverter);
    }

    // valeur du sensor d'entrées X d'un variateur : détection du manuel (anti-rebond)
    private _onElementValue(element: SensorValueModel | ProcessValueModel | null): void {
        const value = element && 'value' in element ? Number(element.value) : NaN;
        if (!element?.id || !Number.isFinite(value)) return;
        for (const inverter of this._inverters.values()) {
            if (inverter.manualSensorId === element.id) {
                this._onInputs(inverter, value);
            }
        }
    }

    private _onInputs(inverter: InverterModel, inputs: number): void {
        const profile = ResolveInverterProfile(inverter.profile);
        const state = this._states.get(inverter._id);
        if (!profile || !state) return;
        const isManual = (inputs & profile.manualInputMask) !== 0;
        const previous = this._manualReadings.get(inverter._id);
        const reading = { isManual, count: previous?.isManual === isManual ? previous.count + 1 : 1 };
        this._manualReadings.set(inverter._id, reading);
        if (reading.isManual === state.isManual || reading.count < MANUAL_DEBOUNCE_READINGS) return;

        state.isManual = isManual;
        this.logger.log({ inverterId: inverter._id, inputs, isManual }, 'inverter manual state changed');
        if (isManual) {
            this._emit(ProcessEventKind.INVERTER_MANUAL_ENGAGED, inverter,
                { sequenceId: state.ownerSequenceId, sequenceName: state.ownerSequenceName });
        } else {
            this._emit(ProcessEventKind.INVERTER_MANUAL_RELEASED, inverter, {});
            void this._reconcile(inverter._id);
        }
    }

    // amène le variateur sur la directive courante (sinon son mode par défaut) ; rien en manuel
    private _reconcile(inverterId: string): Promise<void> {
        return this._enqueue(inverterId, () => this._applyDirective(inverterId));
    }

    private async _applyDirective(inverterId: string): Promise<void> {
        const inverter = this._inverters.get(inverterId);
        const state = this._states.get(inverterId);
        if (!inverter || !state || state.isManual) return;
        const profile = ResolveInverterProfile(inverter.profile);
        if (!profile) {
            this.logger.warn({ inverterId, profile: inverter.profile }, 'no inverter profile, directive not applied');
            return;
        }
        const directive = state.directive ?? this._defaultDirective(inverter);
        let isChanged = false;
        for (const write of this._writesFor(inverter, profile, directive)) {
            if (state.applied[write.role] === write.value) continue;
            isChanged = (await this._write(inverter, state, write)) || isChanged;
        }
        if (isChanged) {
            this._emit(ProcessEventKind.INVERTER_MODE_CHANGED, inverter, this._detail(directive, state.ownerSequenceId, state.ownerSequenceName));
        }
    }

    private _defaultDirective(inverter: InverterModel): InverterDirective {
        return { mode: inverter.defaultMode ?? InverterMode.PID };
    }

    // consigne d'abord (le variateur ne tourne pas sur l'ancienne consigne au changement de mode), puis le mode
    private _writesFor(inverter: InverterModel, profile: InverterProfile, directive: InverterDirective): InverterModeWrite[] {
        const writes: InverterModeWrite[] = [];
        if (directive.mode === InverterMode.RS485 && directive.frequency !== undefined) {
            writes.push({ role: InverterRole.FREQUENCY_SETPOINT, value: this._toRaw(profile, InverterRole.FREQUENCY_SETPOINT, directive.frequency) });
        } else if (directive.mode === InverterMode.RS485) {
            this.logger.warn({ inverterId: inverter._id }, 'RS485 directive without frequency, setpoint unchanged');
        }
        if (directive.mode === InverterMode.PID && directive.pidSetpoint !== undefined) {
            writes.push({ role: InverterRole.PID_SETPOINT, value: this._toRaw(profile, InverterRole.PID_SETPOINT, directive.pidSetpoint) });
        }
        return [...writes, ...(profile.modes[directive.mode] ?? [])];
    }

    // valeur physique (Hz, %) -> valeur brute de la saisie du set (échelle de la register map)
    private _toRaw(profile: InverterProfile, role: InverterRole, value: number): number {
        const ref = profile.roles[role];
        const template = this.deviceCommandService.getTemplate(profile.kind);
        const input = template.registerMap.find((block) => block.id === ref.blockId)
            ?.operations.find((operation) => operation.id === ref.operationId)?.input;
        const scale = input?.type === 'number' ? input.scale ?? 1 : 1;
        return Math.round(value / scale);
    }

    // écriture RAM d'un rôle ; true si écrite
    private async _write(inverter: InverterModel, state: InverterRuntimeState, write: InverterModeWrite): Promise<boolean> {
        const commandId = inverter.commands?.[write.role];
        if (!commandId) {
            this.logger.warn({ inverterId: inverter._id, role: write.role }, 'inverter role without command, not written');
            return false;
        }
        try {
            const outcome = await this.deviceCommandService.execute(commandId, inverter.deviceId,
                { value: write.value, isPersistent: false, isConfirmed: true });
            if (outcome.isOk) {
                state.applied[write.role] = write.value;
                return true;
            }
            this.logger.warn({ inverterId: inverter._id, role: write.role, error: outcome.error?.message }, 'inverter write failed');
        } catch (err) {
            this.logger.warn({ inverterId: inverter._id, role: write.role, err: err.message }, 'inverter write skipped');
        }
        // état inconnu : réécrit à la prochaine réconciliation
        delete state.applied[write.role];
        return false;
    }

    private _enqueue(inverterId: string, task: () => Promise<void>): Promise<void> {
        const previous = this._queues.get(inverterId) ?? Promise.resolve();
        const next = previous.then(task).catch((err) => this.logger.warn({ inverterId, err: err?.message }, 'inverter task failed'));
        this._queues.set(inverterId, next);
        return next;
    }

    private _clearReleaseTimer(inverterId: string): void {
        const timer = this._releaseTimers.get(inverterId);
        if (timer) {
            clearTimeout(timer);
            this._releaseTimers.delete(inverterId);
        }
    }

    private _detail(directive: InverterDirective, sequenceId?: string, sequenceName?: string): InverterEventDetail {
        return {
            mode: directive.mode,
            ...(directive.frequency !== undefined && { frequency: directive.frequency }),
            ...(directive.pidSetpoint !== undefined && { pidSetpoint: directive.pidSetpoint }),
            ...(sequenceId && { sequenceId }),
            ...(sequenceName && { sequenceName })
        };
    }

    private _emit(kind: InverterEventKind, inverter: InverterModel, detail: InverterEventDetail): void {
        this.events$.next({ kind, inverter, detail });
    }
}
