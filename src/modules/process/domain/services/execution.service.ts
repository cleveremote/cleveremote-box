/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { firstValueFrom, from, mergeMap, Observable, of, Subject, tap } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ProcessInvalidTypeError } from '../errors/process-invalid-type-error';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    CauseType,
    ExecutableAction,
    ExecutableStatus,
    ProcessMode,
    CycleType,
    ProcessNotification,
    SequenceCommand,
    SequenceExecutionEntry,
    StartPolicy
} from '../interfaces/executable.interface';
import { ActuatorType, IActuatorModule } from '../interfaces/actuator-module.interface';
import { ComActuatorConfigModel } from '../models/actuator.model';
import { DeviceCommandService } from './device-command.service';
import { DeviceCommandType, InverterConfigParam } from '../models/device-command.model';
import { ModuleTimingConfig, SequenceModel } from '../models/sequence.model';
import { ProcessModel } from '../models/process.model';
import { StructureService } from './configuration.service';
import { ActuatorService } from './actuator.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleModel } from '../models/schedule.model';
import { ChildCycleRef, CycleModel } from '../models/cycle.model';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { ExecutableType } from '../models/value.model';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { EventRepository } from '@process/infrastructure/repositories/event.repository';
import {
    ConditionCauseModel, ConfirmationAnswer, ElementType, EventModel, EventOriginModel, EventSource, EventStopModel, ProcessEventData,
    ProcessEventKind, StopReason
} from '../models/event.model';
import { RunContextModel } from '../models/run-context.model';
import { DescribeCondition, DescribeProcessEvent } from '../utils/process-event-message.util';
import { TriggerService } from './trigger.service';
import { ScheduleService } from './schedule.service';
import { TriggerModel } from '../models/trigger.model';
import { ConditionFailureReporter, evaluateConditions, sortConditions } from '../utils/evaluate-conditions.util';
import { ConditionModel } from '../models/condition.model';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import { GlobalSettingsService } from './global-settings.service';
import { ConfirmationRequestModel } from '../models/confirmation-request.model';
import { InverterControlEvent, InverterControlService } from './inverter/inverter-control.service';

type ProcessReport = { id: string; type: CauseType; cause: string }[];
// causes d'une notification CONDITIONS_NOT_VERIFIED : id = element de la condition fausse
type ConditionReport = { id: string; type: 'CONDITION'; cause: string; condition: ConditionCauseModel }[];

// raison d'arret par defaut d'un ordre OFF, selon son emetteur
const STOP_REASON_BY_SOURCE: Record<EventSource, StopReason> = {
    [EventSource.MANUAL]: StopReason.MANUAL,
    [EventSource.PUSH_BUTTON]: StopReason.PUSH_BUTTON,
    [EventSource.SCHEDULE]: StopReason.SCHEDULE,
    [EventSource.TRIGGER]: StopReason.TRIGGER,
    [EventSource.GROUP]: StopReason.PARENT_STOPPED,
    [EventSource.CYCLE]: StopReason.DRIVEN,
    [EventSource.SYSTEM]: StopReason.SYSTEM_RESET
};

const SOURCE_BY_MODE: Record<ProcessMode, EventSource> = {
    [ProcessMode.MANUAL]: EventSource.MANUAL,
    [ProcessMode.SCHEDULE]: EventSource.SCHEDULE,
    [ProcessMode.TRIGGER]: EventSource.TRIGGER,
    [ProcessMode.SYSTEM]: EventSource.SYSTEM
};

@Injectable()
export class ProcessService {
    public processList: ProcessModel[] = [];
    public queuedSequences = [];
    // sequences de demarrage des Group cycles (regle "orchestration Group") : un token different
    // invalide la boucle _startGroupChildren en cours (cf. groupe qui recoit un OFF pendant qu'il
    // demarre encore ses enfants sequentiellement).
    private groupRunTokens = new Map<string, symbol>();
    // Group ids dont _startGroupChildren est actuellement en train de derouler sa sequence
    // (delayBefore/waitForCompletion/delayAfter) : voir le commentaire sur _startGroupChildren.
    private groupStartsInProgress = new Set<string>();
    // cycle id -> sequences forcees par le front (ordre des demandes), consommees par _runSequences
    // a la fin de la sequence en cours ; entree presente uniquement pendant que _runSequences tourne.
    private forcedSequences = new Map<string, string[]>();
    // sequences terminees par un SKIP du front (journal : raison de fin de la sequence)
    private sequencesSkippedByUser = new Set<string>();
    // sequences terminees parce que leur variateur est passe en manuel : sequence id -> variateur
    private sequencesSkippedByInverter = new Map<string, { id: string; name: string }>();
    // cycle id -> process recu en QUEUED, demarre (FORCE) par _startQueuedCycles quand plus aucun
    // cycle en cours n'est en conflit avec lui ; ordre d'insertion = ordre de demarrage.
    private queuedCycles = new Map<string, ProcessModel>();
    // cycle id -> process en attente de la reponse du front (statut WAITTING_CONFIRMATION) apres un
    // arbitrage perdu ou un schedule.shouldConfirmation ; la reponse (FORCE / QUEUE / OFF) le retire.
    private pendingConfirmations = new Map<string, ProcessModel>();
    public constructor(
        private schedulerRegistry: SchedulerRegistry,
        private configurationService: StructureService,
        private wsService: SocketIoClientProxyService,
        private cycleRepository: CycleRepository,
        private valueRepository: ValueRepository,
        private eventRepository: EventRepository,
        private actuatorService: ActuatorService,
        @Inject(forwardRef(() => TriggerService)) private triggerService: TriggerService,
        @Inject(forwardRef(() => ScheduleService)) private scheduleService: ScheduleService,
        private readonly logger: Logger,
        private deviceCommandService: DeviceCommandService,
        private globalSettingsService: GlobalSettingsService,
        private inverterControlService: InverterControlService
    ) {
        this.inverterControlService.events$.subscribe((event) => {
            this._onInverterEvent(event).catch((error) => this.logger.warn({ error, kind: event.kind }, 'inverter event handling failed'));
        });
    }

    public async execute(process: ProcessModel): Promise<void> {
        this._initializeProcess(process);
        return await this._manageProcessType(process);
    }

    // commandes du front sur une sequence d'un cycle en cours
    public async executeSequenceCommand(sequenceId: string, command: SequenceCommand): Promise<void> {
        if (command === SequenceCommand.SKIP) {
            this._skipSequence(sequenceId);
        } else if (command === SequenceCommand.FORCE) {
            this._forceSequence(sequenceId);
        } else {
            throw new ProcessInvalidTypeError();
        }
    }

    // pilote par un autre cycle (regle 2 CYCLE -> MODULE, enfant demarre par son Group) : son mode
    // est herite de ce cycle. Un arret SYSTEM portant un sourceCycleId (enfant stoppe par son Group)
    // n'est pas "pilote".
    private static _isDriven(process: ProcessModel): boolean {
        return !!process.sourceCycleId && process.mode !== ProcessMode.SYSTEM;
    }

    private _resolveActuators(): Promise<Map<string, IActuatorModule>> {
        return this.actuatorService.resolve(this.configurationService.structure.getModuleIds());
    }

    private _buildManualPushButtonReport(process: ProcessModel): ProcessReport {
        if (process.mode === ProcessMode.TRIGGER && process.cycle.type === CycleType.MODULE && process.policy === StartPolicy.FORCE) {
            return [{ id: process.id, type: CauseType.FORCE, cause: 'manual push button : ' + process.cycle.name }];
        }
        return [];
    }

    // emetteur d'un ordre : explicite (process.origin) ou deduit de son mode / cycle source
    private _originOf(process: ProcessModel): EventOriginModel {
        if (process.origin) {
            return process.origin;
        }
        if (ProcessService._isDriven(process)) {
            return this._cycleOrigin(EventSource.CYCLE, process.sourceCycleId);
        }
        const source = SOURCE_BY_MODE[process.mode] ?? EventSource.SYSTEM;
        return process.schedule ? { source, refId: process.schedule._id, refName: process.schedule.name } : { source };
    }

    // origine "un autre cycle" (Group parent, cycle pilote) : reliee au run en cours de ce cycle
    private _cycleOrigin(source: EventSource, cycleId: string): EventOriginModel {
        const proc = this.processList.find((x) => x.cycle._id === cycleId);
        const name = proc?.cycle.name ?? this.configurationService.structure.cycles.find((x) => x._id === cycleId)?.name;
        return { source, refId: cycleId, refName: name, refRunId: proc?.run?.runId };
    }

    // raison d'arret d'un ordre OFF : explicite (process.stop) ou deduite de son emetteur
    private _stopOf(process: ProcessModel, fallback?: StopReason): EventStopModel {
        const by = process.stop?.by ?? this._originOf(process);
        if (process.stop) {
            return { ...process.stop, by };
        }
        return { reason: fallback ?? STOP_REASON_BY_SOURCE[by.source], by };
    }

    // arret provoque par le demarrage / l'arret d'un autre cycle (preemption, regle 1, cascade)
    private _stopByCycle(reason: StopReason, process: ProcessModel): EventStopModel {
        return {
            reason,
            by: { source: this._originOf(process).source, refId: process.cycle._id, refName: process.cycle.name, refRunId: process.run?.runId }
        };
    }

    // run du process : repris d'un process en attente (confirmation / file) - la reponse du front ne cree pas
    // un nouveau run - sinon le sien, sinon un nouveau. answer : reponse a la confirmation en attente.
    private _adoptRun(process: ProcessModel, waiting?: ProcessModel, answer?: ConfirmationAnswer): RunContextModel {
        const run = (waiting && waiting !== process ? waiting.run : undefined) ?? process.run ?? RunContextModel.create(this._originOf(process));
        if (answer && run.confirmation && !run.confirmation.answer) {
            const answeredAt = new Date();
            run.confirmation.answer = answer;
            run.confirmation.answeredAt = answeredAt;
            run.confirmation.waitMs = answeredAt.getTime() - (run.confirmation.requestedAt ?? run.requestedAt).getTime();
            run.confirmation.answeredBy = process.origin?.requestedBy;
        }
        process.run = run;
        return run;
    }

    // champs communs a tous les events d'un run (copies : le run continue d'evoluer apres l'enregistrement)
    private static _runJournal(run: RunContextModel | undefined): Partial<ProcessEventData> {
        if (!run) {
            return {};
        }
        return {
            runId: run.runId,
            origin: run.origin,
            confirmation: run.confirmation && { ...run.confirmation }
        };
    }

    private static _sequencesSummary(run: RunContextModel | undefined): ProcessEventData['sequences'] {
        return run && { run: [...run.sequences.run], skipped: [...run.sequences.skipped], forced: [...run.sequences.forced] };
    }

    // journal : message lisible calcule ici, et champs principaux repris dans le statut envoye au front
    private _publishStatusEvent(eventPayload: EventModel, wsData: object): Promise<string> {
        const journal = eventPayload.additionalData as ProcessEventData;
        let payload = wsData;
        if (journal.kind) {
            journal.message = DescribeProcessEvent(journal, this.globalSettingsService.language);
            const { kind, runId, origin, stop, message } = journal;
            payload = { ...wsData, kind, runId, origin, stop, message };
        }
        return this.eventRepository.save(eventPayload).then(() => {
            this._sendStatusSync(payload);
            return 'sent';
        });
    }

    private _sendStatusSync(wsData: unknown): void {
        this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(wsData) }, true)
            .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (local)'));
        this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(wsData) }, false)
            .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (remote)'));
    }

    // stop : raison d'arret journalisee ; par defaut celle portee par l'ordre OFF (cf. _stopOf)
    public async reset(process: ProcessModel, causes?: ProcessReport, stop?: EventStopModel): Promise<void> {
        const index = this.processList.map(x => x.cycle._id).indexOf(process.cycle._id);
        this._clearQueuedSequences(process);
        // un arret annule la mise en file QUEUED ; un cycle en file sans entree processList (QUEUED
        // envoye sans confirmation prealable) doit quand meme repasser STOPPED.
        const queued = this.queuedCycles.get(process.cycle._id);
        const wasQueued = this.queuedCycles.delete(process.cycle._id);
        // le statut peut etre reserve (IN_PROCCESS) avant que processList ne contienne l'entree
        // (voir la reservation synchrone de la regle 3) : sans ce fallback, un OFF arrivant dans
        // cette fenetre ne trouverait rien dans processList et ne ferait rien.
        if (index > -1 || process.cycle.status === ExecutableStatus.IN_PROCCESS || wasQueued) {
            this.processList[index]?.instance?.unsubscribe();
            // journal : run du process en cours (ou en file), pas celui de l'ordre OFF ; un cycle encore en
            // file n'a jamais demarre (annulation)
            const run = this.processList[index]?.run ?? queued?.run ?? process.run;
            const isCancelled = wasQueued && !run?.startedAt;
            const stopInfo = stop ?? this._stopOf(process, isCancelled ? StopReason.CANCELLED_WHILE_QUEUED : undefined);
            // flip immediatement (avant tout await) : ce champ est partage (meme CycleModel que
            // configurationService.structure.cycles, cf. _initializeProcess) et sert de signal
            // d'annulation pour toute continuation asynchrone deja en vol (tap de reservation dans
            // _executeWithActuators, _runSequences/_runSequence) qui ne passe pas par processList[index].instance.unsubscribe() -
            // le fixer plus tard (apres les await ci-dessous, comme avant) laissait une fenetre ou
            // ces continuations voyaient encore IN_PROCCESS alors que l'arret etait deja decide.
            process.cycle.status = ExecutableStatus.STOPPED;

            // libere d'abord tout cycle MODULE qui n'est IN_PROCCESS que parce que CE cycle l'a
            // auto-demarre (regle 2, pilote via sourceCycleId le pointant) et qui n'a jamais ete
            // repris depuis par un declenchement independant (sans sourceCycleId) - sinon il reste
            // orphelin indefiniment (status/processList perimes, actuator pourtant deja coupe
            // physiquement plus bas) et _isActuatorStillInUse bloque a tort son actuator pour toute
            // tentative future de l'arreter. Un cycle MODULE repris manuellement/schedule/trigger n'a
            // pas de sourceCycleId et reste protege (cf. test "actuator still used by another active
            // MODULE cycle"). Fait AVANT de calculer modulesToStop ci-dessous : une fois ces MODULE
            // liberes, _isActuatorStillInUse ne les voit plus comme "en cours" et laisse leurs
            // actuators partages etre coupes normalement.
            await this._releaseAutoStartedModules(process.cycle._id);

            const actuators = await this._resolveActuators();
            const modules = process.cycle.getModules(actuators);
            const modulesToStop = modules
                .filter((actuator) => process.mode === ProcessMode.SYSTEM || !this._isActuatorStillInUse(actuator, process.cycle._id, actuators));
            await this.actuatorService.reset(modulesToStop);
            if (index > -1) {
                this.processList.splice(index, 1);
            }
            // pour ne pas avoir de latece lors de l'execution off il etaignait toutes les sequences avant d'etindre le cycle.
            await this._processProgress(process.cycle._id, ExecutableAction.OFF, process.mode, causes, undefined, {
                ...ProcessService._runJournal(run),
                kind: isCancelled ? ProcessEventKind.CYCLE_CANCELLED : ProcessEventKind.CYCLE_ENDED,
                stop: stopInfo,
                sequences: ProcessService._sequencesSummary(run)
            }).then(() => true);
            for (const sequence of process.cycle.sequences) {
                this.sequencesSkippedByUser.delete(sequence._id);
                if (sequence.status !== ExecutableStatus.STOPPED) {
                    await this._processProgress(sequence._id, ExecutableAction.OFF, process.mode, causes, undefined,
                        { runId: run?.runId, cycleId: process.cycle._id, stop: stopInfo }).then(() => true);
                }
            }
            // regle 3 : verifie/eteint le Group parent si tous ses enfants sont maintenant stoppes
            // (voir _syncParentGroupOffIfAllChildrenStopped) ; volontairement DANS ce if (uniquement
            // quand ce cycle vient reellement de transiter vers STOPPED, pas a chaque appel no-op).
            await this._syncParentGroupOffIfAllChildrenStopped(process.cycle._id);
            // en dernier : les actuators de ce cycle sont deja coupes, le cycle en file peut les reprendre
            await this._startQueuedCycles();
        }
        // unref() : ce rappel differe est "fire and forget", il ne doit pas a lui seul empecher
        // le processus de s'arreter (ex: extinction propre, ou fuite de ce timer dans les tests).
        setTimeout(() => {
        }, 20000).unref();

    }

    // regle 2/3/4 (arret d'un MODULE) : un actuator partage ne doit etre coupe que si plus aucun
    // CYCLE ni MODULE actif (autre que celui qu'on est en train d'arreter) ne le reference encore.
    // on exclut aussi les entrees dont le cycle n'est plus IN_PROCCESS (arret deja decide) : elles ne
    // pilotent plus l'actuator.
    private _isActuatorStillInUse(
        actuator: IActuatorModule, excludeCycleId: string, actuators: Map<string, IActuatorModule>
    ): boolean {
        return this.processList.some((proc) =>
            proc.cycle._id !== excludeCycleId &&
            proc.cycle.status === ExecutableStatus.IN_PROCCESS &&
            proc.cycle.exists(actuator, actuators)
        );
    }

    // libere tout cycle MODULE qui n'est IN_PROCCESS que parce que sourceCycleId l'a auto-demarre
    // (regle 2, pilote) et qui n'a jamais ete repris depuis independamment (auquel cas son entree
    // processList n'aurait pas de sourceCycleId, cf. test "independently triggered"). Un
    // reset() complet (status/processList/progress) est applique a chacun, pas seulement une
    // coupure d'actuator, pour que son statut reflete correctement qu'il ne tourne plus.
    private async _releaseAutoStartedModules(sourceCycleId: string): Promise<void> {
        const orphaned = this.processList.filter((proc) =>
            proc.cycle.type === CycleType.MODULE &&
            ProcessService._isDriven(proc) &&
            proc.sourceCycleId === sourceCycleId &&
            proc.cycle.status === ExecutableStatus.IN_PROCCESS
        );
        for (const proc of orphaned) {
            const report: ProcessReport = [{ id: proc.id, type: CauseType.FORCE, cause: 'owning cycle stopped : ' + sourceCycleId }];
            await this.reset(proc, report, { reason: StopReason.PARENT_STOPPED, by: this._cycleOrigin(EventSource.CYCLE, sourceCycleId) });
        }
    }

    public async resetAllModules(): Promise<void> {
        const cycles = await this.cycleRepository.get() as CycleModel[];
        for (const cycleModel of cycles) {
            await this._initialReset(cycleModel);
        }
    }

    public async testAllModules(): Promise<void> {
        const cycles = await this.cycleRepository.get() as CycleModel[];
        for (const cycleModel of cycles) {
            const process = new ProcessModel();
            process.cycle = cycleModel;
            process.action = ExecutableAction.ON;
            process.policy = StartPolicy.FORCE;
            process.mode = ProcessMode.MANUAL;
            await this.execute(process);
        }
    }

    // mapping sortie physique IO module -> actuator COM (via config.deviceId + config.actions[0].channel)
    // -> pilotage du cycle MODULE qui possede cet actuator, sur le meme principe que la regle 2
    // (_triggerOwningModuleCycle) mais declenche par une lecture materielle Modbus plutot que par
    // un CYCLE en cours d'execution. mode = TRIGGER sans sourceCycleId (pas pilote, contrairement a
    // _triggerOwningModuleCycle) : ce chemin n'a pas de cycle CYCLE amont a proteger, donc la regle 1
    // (_cascadeStopConflictingCycles, ignoree pour un process pilote) doit s'appliquer normalement et
    // arreter tout cycle CYCLE en cours partageant un actuator COM/RPI avec ce cycle MODULE.
    // Le garde no-op ci-dessous (etat deja atteint) est indispensable : quand la regle 2 demarre elle-
    // meme ce cycle MODULE (actuator commute par un CYCLE deja en cours), l'ecriture Modbus physique
    // qui en resulte est ensuite re-detectee ~500ms plus tard par DigitalIoMonitorService, qui rappelle
    // cette methode pour son propre echo. Sans ce garde, ce second appel (sans sourceCycleId)
    // declencherait la regle 1 et arreterait a tort le CYCLE qui vient de demarrer ce MODULE.
    public async executeModuleCycleForDigitalOutput(deviceId: string, channel: number, isOn: boolean): Promise<void> {
        const candidates = this.configurationService.structure.actuators.filter((a) => {
            if (a.type !== ActuatorType.COM) return false;
            const config = a.config as ComActuatorConfigModel;
            return config.deviceId === deviceId && config.actions?.[0]?.channel === channel;
        });
        if (!candidates.length) return;

        const actuators = await this._resolveActuators();
        const moduleCycle = this.configurationService.structure.cycles.find((cycle) =>
            cycle.type === CycleType.MODULE && candidates.some((a) => cycle.exists(a, actuators)));
        if (!moduleCycle) return;

        const alreadyInRequestedState = isOn
            ? moduleCycle.status === ExecutableStatus.IN_PROCCESS
            : moduleCycle.status === ExecutableStatus.STOPPED;
        if (alreadyInRequestedState) return;

        // la direction OUTPUT n'est pas stockee sur ComActuatorActionConfig : elle est deduite du
        // bloc de coils vise par le DeviceCommand set de l'actionneur.
        const isDigitalOutput = (await Promise.all(candidates.map(async (a) => {
            const { deviceId, actions } = a.config as ComActuatorConfigModel;
            const [set] = await this.deviceCommandService.actionsOfType(actions, DeviceCommandType.SET);
            return set ? this.deviceCommandService.isDigitalOutput(set.command._id, deviceId) : false;
        }))).some(Boolean);
        if (!isDigitalOutput) return;

        const moduleProcess = new ProcessModel();
        moduleProcess.cycle = moduleCycle;
        moduleProcess.action = isOn ? ExecutableAction.ON : ExecutableAction.OFF;
        moduleProcess.policy = StartPolicy.FORCE;
        moduleProcess.mode = ProcessMode.TRIGGER;
        moduleProcess.origin = { source: EventSource.PUSH_BUTTON, refId: candidates[0]._id, refName: candidates[0].name };
        await this.execute(moduleProcess);
    }

    private _clearQueuedSequences(process: ProcessModel): void {
        process.cycle.sequences.forEach(sequence => {
            const index = this.queuedSequences.findIndex(x => x.sequenceId === sequence._id);
            if (index >= 0) {
                // le timer d'avancement vers la sequence suivante (_runSequence) n'est pas relie
                // au cycle de vie de la subscription RxJS : sans ce clearTimeout explicite il reste
                // arme en arriere-plan apres un arret (cf. commentaire plus haut dans le fichier de
                // test associe documentant la meme fuite).
                clearTimeout(this.queuedSequences[index].timeoutHandle);
                const [queued] = this.queuedSequences.splice(index, 1);
                // reveille _runSequence en attente : il reverifie le statut du cycle et s'arrete
                queued.flag?.next(null);
            }
        });
    }

    // attente de confirmation : process en file, ou statut rehydrate au boot sans entree en memoire
    private _isAwaitingConfirmation(cycle: CycleModel): boolean {
        return this.pendingConfirmations.has(cycle._id) || cycle.status === ExecutableStatus.WAITTING_CONFIRMATION;
    }

    // refus d'une confirmation (IGNORE) ou OFF sur un cycle en attente : abandonne l'attente sans
    // toucher aux actuators, le cycle n'a jamais demarre.
    private _cancelPendingConfirmation(process: ProcessModel): Promise<string> {
        const stop = this._stopOf(process, StopReason.CANCELLED_WHILE_WAITING);
        const run = this._adoptRun(process, this.pendingConfirmations.get(process.cycle._id),
            stop.reason === StopReason.CONFIRMATION_REFUSED ? ConfirmationAnswer.IGNORE : undefined);
        this.pendingConfirmations.delete(process.cycle._id);
        process.cycle.status = ExecutableStatus.STOPPED;

        const data = { type: ExecutableType.CYCLE, id: process.cycle._id, status: ExecutableStatus.STOPPED };
        return this._publishStatusEvent({
            elementId: data.id,
            date: new Date(),
            elementType: ElementType.CYCLE,
            additionalData: {
                type: process.mode, value: data.status, status: data.status,
                ...ProcessService._runJournal(run), kind: ProcessEventKind.CYCLE_CANCELLED, name: process.cycle.name, stop
            }
        }, data);
    }

    // journal : seul un element encore actif au boot (statut rehydrate, ex: crash en pleine execution)
    // est trace comme interrompu ; un element deja arrete ne recoit que l'event historique.
    private async _initialReset(cycleModel: CycleModel): Promise<void> {
        const actuators = await this._resolveActuators();
        await this.actuatorService.reset(cycleModel.getModules(actuators));
        cycleModel.status = ExecutableStatus.STOPPED;
        const stop: EventStopModel = { reason: StopReason.SYSTEM_RESET, by: { source: EventSource.SYSTEM } };
        const rehydratedStatus = this.configurationService.structure.cycles.find((cyc) => cyc._id === cycleModel._id)?.status;

        for (const sequence of cycleModel.sequences) {
            const isRunning = this.configurationService.sequences?.find((seq) => seq._id === sequence._id)?.status === ExecutableStatus.IN_PROCCESS;
            await this._processProgress(sequence._id, ExecutableAction.OFF, ProcessMode.SYSTEM, undefined, undefined,
                isRunning ? { cycleId: cycleModel._id, stop } : undefined).then(() => true);
        }

        const cycleJournal: Partial<ProcessEventData> | undefined = !rehydratedStatus || rehydratedStatus === ExecutableStatus.STOPPED
            ? undefined
            : {
                kind: rehydratedStatus === ExecutableStatus.IN_PROCCESS ? ProcessEventKind.CYCLE_ENDED : ProcessEventKind.CYCLE_CANCELLED,
                stop
            };
        await this._processProgress(cycleModel._id, ExecutableAction.OFF, ProcessMode.SYSTEM, undefined, undefined, cycleJournal);
    }

    private _initializeProcess(process: ProcessModel): void {
        const struct = this.configurationService.structure;
        const currentCycle = struct.cycles.find(x => x._id === process.cycle._id);
        if (!currentCycle) {
            throw new StructureInvalidError();
        }
        process.cycle = currentCycle;
    }

    private async _manageProcessType(process: ProcessModel): Promise<void> {
        if (process.policy === StartPolicy.ARBITRATE) {
            return this._arbitrate(process);
        }
        if (process.policy === StartPolicy.QUEUE) {
            return this._queueCycle(process);
        }
        if (process.policy !== StartPolicy.FORCE) {
            throw new ProcessInvalidTypeError();
        }
        if (process.action === ExecutableAction.OFF && this._isAwaitingConfirmation(process.cycle)) {
            await this._cancelPendingConfirmation(process);
            return;
        }
        await this._executeForced(process);
    }

    private async _executeForced(process: ProcessModel): Promise<void> {
        const isDriven = ProcessService._isDriven(process);
        // un ordre MANUEL direct (pas un enfant pilote par son Group)
        const isDirectManual = process.mode === ProcessMode.MANUAL && !isDriven;
        if (process.cycle.type === CycleType.MODULE && !isDriven) {
            await this._cascadeStopConflictingCycles(process);
        }
        if (process.cycle.type === CycleType.CYCLE && !isDriven && process.action === ExecutableAction.OFF) {
            await this._cascadeStopOwningModules(process);
        }
        if (process.action === ExecutableAction.OFF) {
            let report: ProcessReport;
            if (process.sourceCycleId) {
                report = [];
                report.push({ id: process.id, type: CauseType.FORCE, cause: 'stopped by parent : ' + this.configurationService.structure.cycles.find(x => x._id === process.sourceCycleId)?.name });
            } else {
                report = this._buildManualPushButtonReport(process);
            }
            if (process.cycle.type === CycleType.GROUP) {
                await this._stopGroupChildren(process.cycle);
            }
            await this.reset(process, report);
            // regle child manuel (OFF) : un arret MANUEL direct d'un enfant de Group (pas via
            // _stopChildCycle, qui est en mode=SYSTEM) doit desactiver ses propres trigger/schedule
            // pour empecher un redemarrage automatique - meme geste que _stopGroupChildren fait
            // pour TOUS les enfants quand c'est le Group qui s'arrete. No-op silencieux si
            // l'enfant n'a ni trigger ni schedule.
            if (isDirectManual && process.cycle.parentCycleId) {
                await this._setChildTriggersAndSchedulesPaused(process.cycle._id, true);
                // reset() ci-dessus est un no-op pour un enfant qui n'a jamais reellement
                // demarre (cas trigger/schedule : seul son trigger/schedule etait arme, son
                // status est deja STOPPED et il n'est pas dans processList) - son hook interne
                // _syncParentGroupOffIfAllChildrenStopped ne se declenche donc jamais dans ce
                // cas. Sans cet appel explicite ici, un Group dont TOUS les enfants sont de ce
                // type ne repasserait jamais OFF automatiquement, quel que soit le nombre de
                // clics "stop" recus sur ses enfants.
                await this._syncParentGroupOffIfAllChildrenStopped(process.cycle._id);
            }
        } else {
            if (process.cycle.status === ExecutableStatus.IN_PROCCESS) {
                // regle 2 (reclaim) : un cycle MODULE deja IN_PROCCESS peut changer de cycle CYCLE
                // proprietaire (ex: cycle-B remplace cycle-A suite a une resolution de conflit) sans
                // que son status change (l'actuator est deja/redevient ON via le CYCLE lui-meme) -
                // sans cette mise a jour, son entree processList reste associee a l'ancien
                // sourceCycleId (potentiellement deja retire de processList), ce qui fausse toute
                // lecture ulterieure de "quel cycle pilote ce module actuellement". Exclusion
                // sourceCycleId !== process.cycle._id : la propre sequence du cycle MODULE
                // s'auto-declenche aussi via ce meme mecanisme (rule 2 reutilisee pour son propre
                // actuator) avec sourceCycleId = son propre _id - un no-op inoffensif qu'il ne faut
                // pas laisser ecraser une reelle attribution a un cycle CYCLE proprietaire.
                // existing pilote : ne transfere que d'un proprietaire a un autre - un MODULE deja
                // repris independamment (sans sourceCycleId, cf. test "independently triggered")
                // ne doit jamais se faire reattribuer silencieusement par la cascade rule 2 d'un
                // CYCLE qui partage juste le meme actuator.
                if (process.cycle.type === CycleType.MODULE && isDriven && process.sourceCycleId !== process.cycle._id) {
                    const existing = this.processList.find(x => x.cycle._id === process.cycle._id);
                    if (existing && ProcessService._isDriven(existing) && existing.sourceCycleId !== process.sourceCycleId) {
                        existing.sourceCycleId = process.sourceCycleId;
                        existing.mode = process.mode;
                    }
                }
                return; // regle 3 : ON sur un cycle deja en cours -> no-op silencieux
            }
            // regle child manuel (ON) : miroir exact de _startGroupChildren pour un ON MANUEL
            // envoye directement sur un enfant de Group (pas via _startChildCycle, qui le pilote
            // via sourceCycleId). Si cet enfant possede son propre trigger/schedule, on ne demarre
            // JAMAIS ses sequences ni ne touche au Group parent : on se contente de lever la
            // pause, exactement comme le ferait le Group en le "demarrant". S'il ne possede ni
            // trigger ni schedule, on tombe dans le pipeline normal ci-dessous (deja existant).
            // Exception : un enfant en attente de confirmation (WAITTING_CONFIRMATION) recoit ce
            // FORCE comme la confirmation elle-meme -> il doit suivre le pipeline normal.
            if (isDirectManual && process.cycle.parentCycleId) {
                const isAwaitingConfirmation = this._isAwaitingConfirmation(process.cycle);
                const hasTriggerOrSchedule =
                    !!this._getChildTriggers(process.cycle._id).length || !!this._getChildSchedules(process.cycle._id).length;
                if (hasTriggerOrSchedule && !isAwaitingConfirmation) {
                    await this._setChildTriggersAndSchedulesPaused(process.cycle._id, false);
                    return; // ne jamais demarrer le cycle ni le Group parent dans ce cas
                }
            }
            // un FORCE recu pendant la mise en file ou l'attente de confirmation la court-circuite : il
            // reprend le run en attente (meme runId) et, pour une confirmation, en est la reponse
            const pending = this.pendingConfirmations.get(process.cycle._id);
            this._adoptRun(process, pending ?? this.queuedCycles.get(process.cycle._id), pending ? ConfirmationAnswer.FORCE : undefined);
            this.queuedCycles.delete(process.cycle._id);
            this.pendingConfirmations.delete(process.cycle._id);
            process.cycle.status = ExecutableStatus.IN_PROCCESS; // reservation synchrone (ferme la fenetre TOCTOU)
            // pour un cycle MODULE, _cascadeStopConflictingCycles ci-dessus est deja le
            // mecanisme de resolution de conflit faisant autorite (exclusion du cycle source,
            // restriction COM/RPI) : _resetConflictedProcesses ignore sourceCycleId et
            // stopperait a tort le cycle CYCLE qui vient de declencher ce MODULE (regle 2).
            if (process.cycle.type !== CycleType.MODULE) {
                await this._resetConflictedProcesses(process);
            }
            if (process.cycle.type === CycleType.GROUP) {
                // orchestration Group : ne suit pas le pipeline sequences/actuators (fire-and-forget,
                // comme _executeProcess ci-dessous - execute() ne bloque jamais le temps qu'un cycle tourne).
                this._executeGroupOn(process).catch((err) => this.logger.error({ err }, 'group children start error'));
            } else {
                this._executeProcess(process);
            }
        }
    }

    // arbitrage d'un demarrage (StartPolicy.ARBITRATE) contre les cycles en cours partageant un
    // actuator : rang strictement plus petit (GlobalSettingsService.rankOf) -> FORCE, les conflits
    // seront stoppes ; rang egal ou plus grand, ou schedule.shouldConfirmation -> le cycle attend la
    // reponse du front (FORCE / QUEUE / OFF). Un OFF n'a jamais de conflit.
    private async _arbitrate(process: ProcessModel): Promise<void> {
        if (process.action !== ExecutableAction.OFF && !(await this._canStart(process))) {
            return;
        }
        const report: ProcessReport = [];
        // nouveau run a chaque declenchement (un process de schedule peut etre rejoue)
        process.run = RunContextModel.create(this._originOf(process));
        // detail structure pour la popin du front (causes : textes historiques conserves)
        const confirmation: ConfirmationRequestModel = { isRequested: !!process.schedule?.shouldConfirmation, conflicts: [] };
        let isConfirmationNeeded = confirmation.isRequested;
        if (isConfirmationNeeded) {
            report.push({ id: process.id, type: CauseType.CONFIRMATION, cause: 'schedule triggered : ' + process.cycle.name });
        }
        const rank = this.globalSettingsService.rankOf(process.mode);
        // tous les conflits sont listes : un seul perdu impose la confirmation, et une confirmation
        // FORCE les stoppe tous (_resetConflictedProcesses)
        for (const proc of await this._getConflictedExecutables(process)) {
            const isWinning = rank < this.globalSettingsService.rankOf(proc.mode);
            confirmation.conflicts.push({ cycleId: proc.cycle._id, name: proc.cycle.name, mode: proc.mode, isWinning });
            isConfirmationNeeded = isConfirmationNeeded || !isWinning;
            report.push({
                id: proc.id,
                type: isConfirmationNeeded ? CauseType.CONFIRMATION : CauseType.FORCE,
                cause: 'conflicted with cycle : ' + proc.cycle.name
            });
        }

        // pas d'await (comme avant) : execute() rend la main sans attendre le demarrage effectif
        if (isConfirmationNeeded) {
            process.run.confirmation = { ...confirmation, requestedAt: new Date() };
            this.pendingConfirmations.set(process.cycle._id, process);
            this._needConfirmation(process, report, confirmation)
                .catch((err) => this.logger.warn({ err }, 'failed to publish confirmation request'));
            return;
        }
        process.policy = StartPolicy.FORCE;
        this._manageProcessType(process).catch((err) => this.logger.error({ err }, 'arbitrated start error'));
    }

    // demarrage arbitre : refuse si le cycle tourne deja (regle 3, no-op silencieux sans repasser en
    // attente) ou si ses conditions sont fausses (ni execution, ni confirmation). Un OFF n'est jamais
    // concerne : il doit toujours pouvoir arreter le cycle.
    private async _canStart(process: ProcessModel): Promise<boolean> {
        if (process.cycle.status === ExecutableStatus.IN_PROCCESS) {
            return false;
        }
        const cycleCauses = await this._getCycleConditionCauses(process);
        if (cycleCauses) {
            this.logger.warn({ cycleId: process.cycle._id, mode: process.mode }, 'cycle conditions not verified, cycle not started');
            this._notifyConditionsNotVerified(ExecutableType.CYCLE, process.cycle._id, process.mode, cycleCauses);
            this._journalStartRefused(process, cycleCauses);
            return false;
        }
        const sequenceCauses = await this._getUnverifiedSequencesCauses(process);
        if (sequenceCauses) {
            this.logger.warn({ cycleId: process.cycle._id, mode: process.mode }, 'no sequence verified, cycle not started');
            this._notifyConditionsNotVerified(ExecutableType.CYCLE, process.cycle._id, process.mode, sequenceCauses);
            this._journalStartRefused(process, sequenceCauses);
            return false;
        }
        return true;
    }

    // demarrage refuse : trace sans statut (EventRepository.getLastStatus l'ignore a la rehydratation) ;
    // le front est deja notifie par _notifyConditionsNotVerified. process.run n'est pas touche : le meme
    // process de schedule peut porter le run d'une execution en cours.
    private _journalStartRefused(process: ProcessModel, causes: ConditionReport): void {
        const additionalData: ProcessEventData = {
            type: process.mode,
            ...ProcessService._runJournal(RunContextModel.create(this._originOf(process))),
            kind: ProcessEventKind.START_REFUSED,
            name: process.cycle.name,
            conditions: causes.map((x) => x.cause),
            conditionCauses: causes.map((x) => x.condition)
        };
        additionalData.message = DescribeProcessEvent(additionalData, this.globalSettingsService.language);
        this.eventRepository.save({ elementId: process.cycle._id, date: new Date(), elementType: ElementType.CYCLE, additionalData })
            .catch((err) => this.logger.warn({ err }, 'failed to save start refused event'));
    }

    // null des qu'une sequence est verifiee, sinon les causes de toutes les sequences (prefixees par leur nom).
    // un cycle sans sequence (ex: GROUP) n'est pas concerne
    private async _getUnverifiedSequencesCauses(process: ProcessModel): Promise<ConditionReport | null> {
        if (process.cycle.type === CycleType.GROUP || !process.cycle.sequences?.length) { return null; }
        const causes: ConditionReport = [];
        for (const sequence of process.cycle.sequences) {
            const sequenceCauses = await this._getSequenceConditionCauses(sequence._id);
            if (!sequenceCauses) { return null; }
            causes.push(...sequenceCauses.map((x) => {
                const condition = { ...x.condition, sequenceId: sequence._id, sequenceName: sequence.name };
                return { ...x, cause: this._describeCondition(condition), condition };
            }));
        }
        return causes;
    }

    private _getCycleConditionCauses(process: ProcessModel): Promise<ConditionReport | null> {
        return this._getConditionCauses(process.cycle.conditions,
            (detail) => this.logger.warn({ cycleId: process.cycle._id, ...detail }, 'cycle conditions not verified'));
    }

    // null si les conditions sont verifiees, sinon une cause par condition fausse (ou l'erreur de structure)
    private async _getConditionCauses(conditions: ConditionModel[] | undefined,
        onFailure: ConditionFailureReporter): Promise<ConditionReport | null> {
        const values = new Map<string, SensorValueModel | ProcessValueModel | undefined>();
        let failure: Parameters<ConditionFailureReporter>[0] | undefined;
        const isVerified = await evaluateConditions(conditions, async (elementId) => {
            const value = await this.valueRepository.getDeviceValue(elementId);
            values.set(elementId, value);
            return value;
        }, (detail) => {
            failure = detail;
            onFailure(detail);
        });
        if (isVerified) { return null; }
        if (!failure?.results) {
            const reason = failure?.reason ?? 'conditions not verified';
            return [{ id: null, type: 'CONDITION', cause: reason, condition: { elementId: null, error: reason } }];
        }
        return sortConditions(conditions)
            .filter((_, i) => !failure.results[i])
            .map((condition) => {
                const cause = this._toConditionCause(condition, values.get(condition.elementId));
                return { id: condition.elementId, type: 'CONDITION', cause: this._describeCondition(cause), condition: cause };
            });
    }

    private _toConditionCause(condition: ConditionModel, current: SensorValueModel | ProcessValueModel | undefined): ConditionCauseModel {
        const elementName = this.configurationService.structure?.sensors?.find((x) => x._id === condition.elementId)?.name
            ?? this.configurationService.structure?.cycles?.find((x) => x._id === condition.elementId)?.name
            ?? this.configurationService.sequences?.find((x) => x._id === condition.elementId)?.name;
        return {
            elementId: condition.elementId, elementType: condition.elementType, elementName,
            operator: condition.operator, expected: condition.value,
            current: (current as SensorValueModel)?.value ?? (current as ProcessValueModel)?.status
        };
    }

    // texte des causes (notification, conditions[]) dans la langue de la box ; le journal relu est retraduit
    // depuis ConditionCauseModel (cf. TranslateEventMessages)
    private _describeCondition(cause: ConditionCauseModel): string {
        return DescribeCondition(cause, this.globalSettingsService.language);
    }

    // pas d'event persiste : la notification ne doit pas devenir le dernier statut rehydrate au boot
    // (cf. StructureService._rehydrateProcessStatus) ; le statut envoye reste le statut reel de l'element.
    private _notifyConditionsNotVerified(type: ExecutableType, id: string, mode: ProcessMode, causes: ConditionReport): void {
        const element = type === ExecutableType.CYCLE
            ? this.configurationService.structure?.cycles?.find((cyc) => cyc._id === id)
            : this.configurationService.sequences?.find((seq) => seq._id === id);
        this._sendStatusSync({
            type, id, mode, status: element?.status ?? ExecutableStatus.STOPPED,
            notification: ProcessNotification.CONDITIONS_NOT_VERIFIED, causes
        });
    }

    private _executeProcess(process: ProcessModel): void {

        process.instance = this._execute(process).subscribe(
            {
                next: async () => {
                    const report: ProcessReport = [];
                    report.push({ id: process.id, type: CauseType.FORCE, cause: 'end lifecycle normal stop : ' + process.cycle.name });
                    await this.reset(process, report, { reason: StopReason.COMPLETED });
                },
                error: async (_err) => {
                    this.logger.error({ err: _err }, 'execution error');
                    const report: ProcessReport = [];
                    report.push({ id: process.id, type: CauseType.FORCE, cause: 'abnormal stop : ' + process.cycle.name + 'detail:=>' + _err });
                    await this.reset(process, report, { reason: StopReason.ERROR, error: _err?.message ?? String(_err) });
                }
            }
        );
    }

    // CYCLE_STARTED : le cycle passe reellement IN_PROCCESS (CYCLE / MODULE / GROUP)
    private _journalCycleStarted(process: ProcessModel, report: ProcessReport): Promise<string> {
        const run = process.run ?? this._adoptRun(process);
        run.startedAt = new Date();
        return this._processProgress(process.cycle._id, ExecutableAction.ON, process.mode, report, undefined, {
            ...ProcessService._runJournal(run),
            kind: ProcessEventKind.CYCLE_STARTED,
            preempted: [...run.preempted]
        });
    }

    private _runOf(cycleId: string): RunContextModel | undefined {
        return this.processList.find((x) => x.cycle._id === cycleId)?.run;
    }

    private _sequenceName(sequenceId: string): string {
        return this.configurationService.sequences.find((x) => x._id === sequenceId)?.name ?? sequenceId;
    }

    // orchestration Group : le parent marque son propre statut/progress puis demarre ses enfants
    // en tache de fond (ne bloque pas execute(), au meme titre que _executeProcess pour un CYCLE).
    private async _executeGroupOn(process: ProcessModel): Promise<void> {
        this.processList.push(process);
        await this._journalCycleStarted(process, []);
        const token = Symbol();
        this.groupRunTokens.set(process.cycle._id, token);
        await this._startGroupChildren(process.cycle, token, process.mode);
    }

    // groupStartsInProgress est marque pendant toute la duree de la sequence de demarrage : un
    // enfant en waitForCompletion qui s'arrete "normalement" (pour laisser la place au suivant) ne
    // doit pas etre lu par _syncParentGroupOffIfAllChildrenStopped comme "tous les enfants sont
    // stoppes, eteindre le Group" - ce serait une fausse lecture puisque le prochain enfant n'a pas
    // encore eu sa chance de demarrer. Le try/finally est isole dans cette methode (plutot que
    // directement autour de la boucle de _runGroupChildrenSequence) pour ne pas ajouter un niveau
    // d'imbrication supplementaire a une boucle deja profondement imbriquee.
    private async _startGroupChildren(groupCycle: CycleModel, token: symbol, mode: ProcessMode): Promise<void> {
        this.groupStartsInProgress.add(groupCycle._id);
        try {
            await this._runGroupChildrenSequence(groupCycle, token, mode);
        } finally {
            this.groupStartsInProgress.delete(groupCycle._id);
        }
    }

    // parcourt les enfants dans l'ordre (config.order), en respectant isSkipped/delayBefore/
    // delayAfter/waitForCompletion ; s'arrete si le groupe a recu un OFF entretemps (token invalide).
    // mode = origine du Group, heritee par les enfants qu'il demarre.
    private async _runGroupChildrenSequence(groupCycle: CycleModel, token: symbol, mode: ProcessMode): Promise<void> {
        for (const ref of this._getOrderedChildRefs(groupCycle)) {
            if (this.groupRunTokens.get(groupCycle._id) !== token) {
                return;
            }
            if (ref.config?.isSkipped) {
                continue;
            }
            const child = this.configurationService.structure.cycles.find(x => x._id === ref.cycleId);
            if (!child) {
                continue;
            }
            if (ref.config?.delayBefore > 0) {
                await new Promise(resolve => setTimeout(resolve, ref.config.delayBefore));
                if (this.groupRunTokens.get(groupCycle._id) !== token) {
                    return;
                }
            }
            const hasTriggerOrSchedule = !!this._getChildTriggers(child._id).length || !!this._getChildSchedules(child._id).length;
            if (hasTriggerOrSchedule) {
                await this._setChildTriggersAndSchedulesPaused(child._id, false);
            } else {
                await this._startChildCycle(child, groupCycle._id, mode);
                if (ref.config?.waitForCompletion) {
                    await this._waitForCycleStopped(child);
                    if (this.groupRunTokens.get(groupCycle._id) !== token) {
                        return;
                    }
                }
            }
            if (ref.config?.delayAfter > 0) {
                await new Promise(resolve => setTimeout(resolve, ref.config.delayAfter));
            }
        }
    }

    // stoppe les enfants Group en cours d'execution et desactive leurs triggers/schedules ; invalide
    // aussi le token de demarrage pour couper court a une sequence _startGroupChildren en attente.
    private async _stopGroupChildren(groupCycle: CycleModel): Promise<void> {
        this.groupRunTokens.delete(groupCycle._id);
        for (const ref of this._getOrderedChildRefs(groupCycle)) {
            if (ref.config?.isSkipped) {
                continue;
            }
            const child = this.configurationService.structure.cycles.find(x => x._id === ref.cycleId);
            if (!child) {
                continue;
            }
            if (child.status === ExecutableStatus.IN_PROCCESS) {
                await this._stopChildCycle(child, groupCycle._id);
            }
            await this._setChildTriggersAndSchedulesPaused(child._id, true);
        }
    }

    private _getOrderedChildRefs(groupCycle: CycleModel): ChildCycleRef[] {
        return [...(groupCycle.childCycles || [])].sort((a, b) => (a.config?.order ?? 0) - (b.config?.order ?? 0));
    }

    private _getChildTriggers(childCycleId: string): TriggerModel[] {
        return this.configurationService.triggers.filter(x => x.cycleId === childCycleId);
    }

    private _getChildSchedules(childCycleId: string): ScheduleModel[] {
        return this.configurationService.schedules.filter(x => x.cycleId === childCycleId);
    }

    private async _setChildTriggersAndSchedulesPaused(childCycleId: string, isPaused: boolean): Promise<void> {
        for (const trigger of this._getChildTriggers(childCycleId)) {
            await this.triggerService.setPaused(trigger, isPaused);
        }
        for (const schedule of this._getChildSchedules(childCycleId)) {
            await this.scheduleService.setPaused(schedule, isPaused);
        }
    }

    // regle 3 (sync auto Group -> OFF) : chaque fois qu'un cycle passe reellement a STOPPED (quelle
    // qu'en soit la cause - arret manuel, fin de sequence naturelle, cascade actuator, ou un enfant
    // stoppe par le Group lui-meme), si ce cycle est l'enfant d'un Group actuellement IN_PROCCESS et
    // que tous les autres enfants non-isSkipped de ce Group sont eux aussi STOPPED, on eteint
    // automatiquement le Group (re-entrant via execute(), pour que _stopGroupChildren + reset()
    // s'appliquent normalement). Resout TOUJOURS les cycles via configurationService.structure.cycles
    // par id (jamais process.cycle directement) : reset() est aussi appele directement par de
    // nombreux appelants (cascade regle 1, _stopChildCycle, etc.) avec des ProcessModel synthetiques
    // dont process.cycle peut etre une reference perimee/differente de l'objet canonique.
    // Pas de recursion infinie : un Group n'a normalement pas lui-meme de parentCycleId (seuls ses
    // enfants en ont un) - quand ce meme mecanisme tourne pour la transition STOPPED du Group lui-
    // meme (declenchee ci-dessous), stoppedCycle.parentCycleId est null et la methode retourne
    // immediatement.
    private async _syncParentGroupOffIfAllChildrenStopped(stoppedCycleId: string): Promise<void> {
        const stoppedCycle = this.configurationService.structure.cycles.find(x => x._id === stoppedCycleId);
        if (!stoppedCycle?.parentCycleId) {
            return;
        }
        const group = this.configurationService.structure.cycles.find(x => x._id === stoppedCycle.parentCycleId);
        if (!group || group.type !== CycleType.GROUP || group.status !== ExecutableStatus.IN_PROCCESS) {
            return;
        }
        if (this.groupStartsInProgress.has(group._id)) {
            // _startGroupChildren deroule encore sa sequence (ex: attend qu'un enfant
            // waitForCompletion se termine avant de demarrer le suivant) - ne pas l'interrompre.
            return;
        }
        const isEveryChildStopped = this._getOrderedChildRefs(group)
            .filter((ref) => !ref.config?.isSkipped)
            .every((ref) => {
                const child = this.configurationService.structure.cycles.find(x => x._id === ref.cycleId);
                return !child || child.status === ExecutableStatus.STOPPED;
            });
        if (!isEveryChildStopped) {
            return;
        }
        const groupOffProcess = new ProcessModel();
        groupOffProcess.cycle = group;
        groupOffProcess.action = ExecutableAction.OFF;
        groupOffProcess.policy = StartPolicy.FORCE;
        groupOffProcess.mode = ProcessMode.SYSTEM;
        groupOffProcess.stop = { reason: StopReason.COMPLETED, by: { source: EventSource.SYSTEM } };
        await this.execute(groupOffProcess);
    }

    private async _startChildCycle(child: CycleModel, sourceCycleId: string, mode: ProcessMode): Promise<void> {
        if (child.status === ExecutableStatus.IN_PROCCESS) {
            return;
        }
        const childProcess = new ProcessModel();
        childProcess.cycle = child;
        childProcess.action = ExecutableAction.ON;
        childProcess.policy = StartPolicy.FORCE;
        childProcess.mode = mode;
        childProcess.sourceCycleId = sourceCycleId;
        childProcess.origin = this._cycleOrigin(EventSource.GROUP, sourceCycleId);
        await this.execute(childProcess);
    }

    private async _stopChildCycle(child: CycleModel, sourceCycleId: string): Promise<void> {
        const childProcess = new ProcessModel();
        childProcess.cycle = child;
        childProcess.action = ExecutableAction.OFF;
        childProcess.policy = StartPolicy.FORCE;
        childProcess.mode = ProcessMode.SYSTEM;
        childProcess.sourceCycleId = sourceCycleId;
        childProcess.stop = { reason: StopReason.PARENT_STOPPED, by: this._cycleOrigin(EventSource.GROUP, sourceCycleId) };
        await this.execute(childProcess);
    }

    private _waitForCycleStopped(cycle: CycleModel, pollIntervalMs = 250): Promise<void> {
        if (cycle.status !== ExecutableStatus.IN_PROCCESS) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (cycle.status !== ExecutableStatus.IN_PROCCESS) {
                    clearInterval(interval);
                    resolve();
                }
            }, pollIntervalMs);
        });
    }

    private async _resetConflictedProcesses(process: ProcessModel): Promise<void> {
        const conflictedProcesses: ProcessModel[] = await this._getConflictedExecutables(process);
        for (const proc of conflictedProcesses) {
            proc.mode = ProcessMode.SYSTEM; // pour que la regle 1 (_cascadeStopConflictingCycles) s'applique aussi a ces arrets
            const report: ProcessReport = [];
            report.push({ id: proc.id, type: CauseType.FORCE, cause: 'stopped by conflicted cycle : ' + process.cycle.name });
            process.run?.preempted.push(proc.cycle.name);
            await this.reset(proc, report, this._stopByCycle(StopReason.PREEMPTED, process));
        }
    }

    // QUEUED (reponse a une confirmation) : le cycle attend la fin des cycles en conflit sans les
    // interrompre, puis demarre comme un FORCE (cf. _startQueuedCycles) ; sans conflit en cours il
    // demarre immediatement.
    private async _queueCycle(process: ProcessModel): Promise<void> {
        if (process.action === ExecutableAction.OFF) {
            this.logger.warn({ cycleId: process.cycle._id }, 'queued OFF ignored');
            return;
        }
        if (process.cycle.status === ExecutableStatus.IN_PROCCESS) {
            return; // regle 3 : deja en cours -> no-op silencieux
        }
        const run = this._adoptRun(process, this.pendingConfirmations.get(process.cycle._id), ConfirmationAnswer.QUEUE);
        this.pendingConfirmations.delete(process.cycle._id);
        const actuators = await this._resolveActuators();
        const conflicts = this._getRunningConflicts(process.cycle, actuators);
        if (!conflicts.length) {
            process.policy = StartPolicy.FORCE;
            return this._manageProcessType(process);
        }
        // mise en file synchrone apres le calcul des conflits : aucun arret ne peut s'intercaler et etre manque
        this.queuedCycles.set(process.cycle._id, process);
        const report: ProcessReport = conflicts
            .map((cyc) => ({ id: process.id, type: CauseType.QUEUED, cause: 'queued after cycle : ' + cyc.name }));
        this.logger.log({ cycleId: process.cycle._id, waitingFor: conflicts.map((cyc) => cyc._id) }, 'cycle queued');
        run.queuedAt = new Date();
        await this._publishWaitingStatus(process, ExecutableStatus.QUEUED, report, undefined, conflicts.map((cyc) => cyc.name));
    }

    // demarre, dans l'ordre de mise en file, chaque cycle QUEUED qui n'a plus de conflit en cours ; un
    // cycle demarre ici (statut reserve IN_PROCCESS de facon synchrone) bloque les suivants qui partagent
    // ses actuators.
    private async _startQueuedCycles(): Promise<void> {
        if (!this.queuedCycles.size) {
            return;
        }
        const actuators = await this._resolveActuators();
        for (const [cycleId, queued] of [...this.queuedCycles]) {
            // retire/remplace entretemps (OFF, IGNORE, FORCE, ou un autre _startQueuedCycles concurrent)
            if (this.queuedCycles.get(cycleId) !== queued || this._getRunningConflicts(queued.cycle, actuators).length) {
                continue;
            }
            this.queuedCycles.delete(cycleId);
            this.logger.log({ cycleId }, 'conflicts ended, starting queued cycle');
            queued.policy = StartPolicy.FORCE;
            await this._manageProcessType(queued);
        }
    }

    // cycles en cours (hors MODULE, cf. _getConflictedExecutables) partageant un actuator avec cycle. Lit le
    // statut, reserve de facon synchrone au demarrage, plutot que processList qui n'est rempli qu'apres
    // _resolveActuators : un cycle en train de demarrer compte deja comme conflit.
    private _getRunningConflicts(cycle: CycleModel, actuators: Map<string, IActuatorModule>): CycleModel[] {
        const modules = cycle.getModules(actuators);
        return this.configurationService.structure.cycles.filter((cyc) =>
            cyc._id !== cycle._id && cyc.type !== CycleType.MODULE && cyc.status === ExecutableStatus.IN_PROCCESS &&
            (modules.some((module) => cyc.exists(module, actuators)) || ProcessService._sharesInverter(cycle, cyc)));
    }

    // deux cycles pilotant le meme variateur (directives de leurs sequences) sont en conflit, comme sur un actuator
    private static _sharesInverter(cycle: CycleModel, other: CycleModel): boolean {
        const inverterIds = cycle.getInverterIds?.() ?? [];
        return inverterIds.length > 0 && (other.getInverterIds?.() ?? []).some((id) => inverterIds.includes(id));
    }

    // un cycle MODULE partageant un actuator n'est jamais un "conflit" a arbitrer ici (rang/
    // confirmation) : rule 1 (_cascadeStopConflictingCycles) et rule 2 (_triggerOwningModuleCycle)
    // gerent deja entierement la relation CYCLE<->MODULE sur cet actuator, de facon automatique et
    // sans jamais demander de confirmation - y compris pour un cycle demarre manuellement (FORCE
    // direct, qui ne passe meme pas par _arbitrate). Un cycle demarre via son propre schedule/trigger
    // (StartPolicy.ARBITRATE -> _arbitrate) doit se comporter de la meme facon : un MODULE actif sur
    // le meme actuator ne doit jamais a lui seul declencher une demande de confirmation. Les cycles en
    // attente de confirmation ne sont pas dans processList (cf. pendingConfirmations).
    private async _getConflictedExecutables(process: ProcessModel): Promise<ProcessModel[]> {
        const conflictedExecutable: ProcessModel[] = [];
        const actuators = await this._resolveActuators();
        const modules = process.cycle.getModules(actuators);
        modules.forEach((module) => {
            this.processList.forEach((proc) => {
                const isConflicting = proc.cycle._id !== process.cycle._id
                    && proc.cycle.type !== CycleType.MODULE && proc.cycle.exists(module, actuators)
                    && !conflictedExecutable.find((x) => x.cycle._id === proc.cycle._id) && process.action !== 'OFF';
                if (isConflicting) {
                    conflictedExecutable.push(proc);
                }
            });
        });
        this.processList.forEach((proc) => {
            const isConflicting = proc.cycle._id !== process.cycle._id && proc.cycle.type !== CycleType.MODULE
                && process.action !== 'OFF' && !conflictedExecutable.find((x) => x.cycle._id === proc.cycle._id)
                && ProcessService._sharesInverter(process.cycle, proc.cycle);
            if (isConflicting) {
                conflictedExecutable.push(proc);
            }
        });

        return conflictedExecutable;
    }

    // regle 1 : un ON/OFF sur un cycle MODULE (non pilote) stoppe immediatement (sans passer par le
    // rang / la confirmation) tous les cycles CYCLE partageant au moins un actuator COM/RPI avec lui.
    private async _cascadeStopConflictingCycles(process: ProcessModel): Promise<void> {
        const actuators = await this._resolveActuators();
        const moduleActuators = process.cycle.getModules(actuators)
            .filter((actuator) => actuator.type === ActuatorType.COM || actuator.type === ActuatorType.RPI);
        if (!moduleActuators.length) {
            return;
        }

        const conflicting = this.processList.filter((proc) =>
            proc.cycle.type === CycleType.CYCLE &&
            proc.cycle._id !== process.sourceCycleId &&
            moduleActuators.some((actuator) => proc.cycle.exists(actuator, actuators))
        );

        for (const proc of conflicting) {
            const report: ProcessReport = [];
            report.push({ id: proc.id, type: CauseType.FORCE, cause: 'single module stop  : ' + process.cycle.name });

            await this.reset(proc, report, this._stopByCycle(StopReason.MODULE_OVERRIDE, process));
        }
    }

    // regle 1 (sens inverse) : un arret MANUEL d'un cycle CYCLE (pas via la cascade regle 1
    // elle-meme, qui appelle reset() directement en court-circuitant _manageProcessType) stoppe
    // aussi tout cycle MODULE actif partageant un actuator COM/RPI avec lui.
    private async _cascadeStopOwningModules(process: ProcessModel): Promise<void> {
        const actuators = await this._resolveActuators();
        const cycleActuators = process.cycle.getModules(actuators)
            .filter((actuator) => actuator.type === ActuatorType.COM || actuator.type === ActuatorType.RPI);
        if (!cycleActuators.length) {
            return;
        }

        const owningModules = this.processList.filter((proc) =>
            proc.cycle.type === CycleType.MODULE &&
            cycleActuators.some((actuator) => proc.cycle.exists(actuator, actuators))
        );

        for (const proc of owningModules) {
            const report: ProcessReport = [];
            report.push({ id: proc.id, type: CauseType.FORCE, cause: 'parent cycle stop : ' + process.cycle.name });

            await this.reset(proc, report, this._stopByCycle(StopReason.PARENT_STOPPED, process));
        }
    }

    // regle 2 : trouve le cycle MODULE possedant cet actuator, et pilote son ON/OFF au moment
    // precis ou le cycle CYCLE (sourceCycleId) commute effectivement cet actuator ; le MODULE herite
    // du mode (origine) de ce cycle.
    private async _triggerOwningModuleCycle(
        actuator: IActuatorModule, action: number, sourceCycleId: string | undefined, mode: ProcessMode
    ): Promise<void> {
        if (!sourceCycleId) {
            return;
        }
        if (actuator.type !== ActuatorType.COM && actuator.type !== ActuatorType.RPI) {
            return;
        }

        const actuators = await this._resolveActuators();
        const moduleCycle = this.configurationService.structure.cycles.find((cycle) =>
            cycle.type === CycleType.MODULE && cycle.exists(actuator, actuators));
        if (!moduleCycle) {
            return;
        }

        const moduleProcess = new ProcessModel();
        moduleProcess.cycle = moduleCycle;
        moduleProcess.action = action === 1 ? ExecutableAction.ON : ExecutableAction.OFF;
        moduleProcess.policy = StartPolicy.FORCE;
        moduleProcess.mode = mode;
        moduleProcess.sourceCycleId = sourceCycleId;
        moduleProcess.origin = this._cycleOrigin(EventSource.CYCLE, sourceCycleId);
        await this.execute(moduleProcess);
    }

    private _execute(process: ProcessModel): Observable<void> {
        if (process.action === ExecutableAction.OFF) {
            return from(this.reset(process, this._buildManualPushButtonReport(process)));
        }
        return from(this._resolveActuators()).pipe(
            mergeMap((actuators) => this._executeWithActuators(process, actuators))
        );
    }

    // eslint-disable-next-line max-lines-per-function
    private _executeWithActuators(process: ProcessModel, actuators: Map<string, IActuatorModule>): Observable<void> {
        const modules = process.cycle.getModules(actuators);
        const timings = process.cycle.getModuleTimings(actuators);
        const executionLst = process.cycle.getExecutionStructure(process.duration, actuators);
        // regle 2 : seul un cycle CYCLE en cours d'execution pilote son(ses) cycle(s) MODULE au fil de l'eau
        const sourceCycleId = ([CycleType.CYCLE, CycleType.MODULE].includes(process.cycle.type)) ? process.cycle._id : undefined;
        const obs: Observable<SequenceExecutionEntry> =
            ProcessService._ofNull<SequenceExecutionEntry>()
                .pipe(tap(async () => {
                    // process.cycle.status a ete reserve de facon synchrone (IN_PROCCESS) avant que
                    // cette chaine ne soit meme construite (voir la reservation synchrone dans
                    // _manageProcessType) ; s'il n'est plus IN_PROCCESS ici, un reset() concurrent
                    // s'est deja execute pendant l'attente de _resolveActuators() (TOCTOU) - ne pas
                    // ecraser le STOPPED qu'il vient de poser ni pousser ce process dans processList,
                    // sinon ce cycle continuerait de tourner comme un zombie jusqu'a sa sequence 2.
                    if (process.cycle.status !== ExecutableStatus.IN_PROCCESS) {
                        return;
                    }
                    this.processList.push(process);
                    const report = this._buildManualPushButtonReport(process);

                    await this._journalCycleStarted(process, report);
                }));

        return obs.pipe(
            mergeMap(() => from(this._runSequences(process, executionLst, modules, timings, sourceCycleId)))
        );
    }

    // termine la sequence en cours (reveille _runSequence) : le cycle passe a la suivante. byInverter : variateur
    // passe en manuel (sinon SKIP du front)
    private _skipSequence(sequenceId: string, byInverter?: { id: string; name: string }): void {
        const running = this.queuedSequences.find(x => x.sequenceId === sequenceId);
        if (!running) {
            this.logger.warn({ sequenceId }, 'sequence skip ignored (sequence not running)');
            return;
        }
        if (byInverter) {
            this.sequencesSkippedByInverter.set(sequenceId, byInverter);
        } else {
            this.sequencesSkippedByUser.add(sequenceId);
        }
        running.flag.next(null);
    }

    // force une sequence sautee (conditions fausses, deja notifiee au front) : sans interrompre la sequence
    // en cours, elle est lancee des sa fin, sans reevaluer ses conditions (cf. _runOrderedSequences).
    private _forceSequence(sequenceId: string): void {
        const cycle = this.configurationService.structure.cycles.find((cyc) =>
            cyc.status === ExecutableStatus.IN_PROCCESS && cyc.sequences?.some((seq) => seq._id === sequenceId));
        const forced = cycle && this.forcedSequences.get(cycle._id);
        if (!forced) {
            this.logger.warn({ sequenceId }, 'sequence force ignored (owning cycle not running)');
            return;
        }
        if (!forced.includes(sequenceId)) {
            forced.push(sequenceId);
        }
        this.logger.log({ cycleId: cycle._id, sequenceId }, 'sequence forced, queued after the running sequence');
    }

    // le try/finally est isole ici (meme principe que _startGroupChildren) : la file des sequences
    // forcees n'existe que le temps de l'execution des sequences du cycle.
    private async _runSequences(process: ProcessModel, executionLst: SequenceExecutionEntry[], modules: IActuatorModule[],
        timings: Map<string, ModuleTimingConfig>, sourceCycleId?: string): Promise<null> {
        const forced: string[] = [];
        this.forcedSequences.set(process.cycle._id, forced);
        try {
            return await this._runOrderedSequences(process, executionLst, modules, timings, forced, sourceCycleId);
        } finally {
            // un redemarrage du cycle a pu deja enregistrer sa propre file
            if (this.forcedSequences.get(process.cycle._id) === forced) {
                this.forcedSequences.delete(process.cycle._id);
            }
        }
    }

    // execute les sequences dans l'ordre du cycle : une sequence dont les conditions sont fausses est
    // sautee (pas de confirmation) ; une sequence sautee qui devient verifiee pendant que le cycle tourne
    // est rattrapee des la fin de la sequence en cours (ordre du cycle). Une sequence sautee forcee par
    // le front passe avant tout le reste (suivante ou rattrapage). Fin de la derniere sequence
    // (rattrapages compris) => fin du cycle, meme si des sequences sautees restent non verifiees.
    private async _runOrderedSequences(process: ProcessModel, executionLst: SequenceExecutionEntry[], modules: IActuatorModule[],
        timings: Map<string, ModuleTimingConfig>, forced: string[], sourceCycleId?: string): Promise<null> {
        const cycle = process.cycle;
        const isCancelled = (): boolean => cycle.status !== ExecutableStatus.IN_PROCCESS;
        const skipped = new Set<number>();
        // seule la derniere sequence reellement lancee doit couper ses modules au passage a la suivante
        let lastRun: SequenceExecutionEntry | undefined;

        // sequences forcees pendant la sequence qui vient de se terminer (ou pendant une forcee) : dans
        // l'ordre des demandes, sans reevaluer leurs conditions ; seule une sequence encore sautee est concernee.
        const runForced = async (): Promise<void> => {
            while (forced.length && !isCancelled()) {
                const sequenceId = forced.shift();
                const i = executionLst.findIndex((x, index) => x.sequenceId === sequenceId && skipped.has(index));
                if (i < 0) {
                    this.logger.warn({ cycleId: cycle._id, sequenceId }, 'forced sequence ignored (not skipped)');
                    continue;
                }
                skipped.delete(i);
                this.logger.log({ cycleId: cycle._id, sequenceId }, 'forced sequence launched');
                process.run?.sequences.forced.push(this._sequenceName(sequenceId));
                lastRun = await this._runSequence(lastRun, executionLst[i], modules, timings, process.mode, cycle, sourceCycleId, true);
            }
        };

        const run = async (sequence: SequenceExecutionEntry): Promise<void> => {
            lastRun = await this._runSequence(lastRun, sequence, modules, timings, process.mode, cycle, sourceCycleId);
            await runForced();
        };

        const runCatchUps = async (upTo: number): Promise<void> => {
            let next = [...skipped].sort((x, y) => x - y).filter((i) => i <= upTo);
            while (next.length && !isCancelled()) {
                let isLaunched = false;
                for (const i of next) {
                    if (isCancelled()) { return; }
                    if (await this._checkSequenceCondition(executionLst[i].sequenceId)) {
                        skipped.delete(i);
                        this.logger.log({ cycleId: cycle._id, sequenceId: executionLst[i].sequenceId }, 'skipped sequence now verified, catching up');
                        await run(executionLst[i]);
                        isLaunched = true;
                        break; // reprendre depuis la premiere sequence sautee (ordre du cycle)
                    }
                }
                if (!isLaunched) { return; }
                next = [...skipped].sort((x, y) => x - y).filter((i) => i <= upTo);
            }
        };

        for (let i = 0; i < executionLst.length; i++) {
            if (isCancelled()) { return null; }
            const sequence = executionLst[i];
            const sequenceCauses = await this._getSequenceConditionCauses(sequence.sequenceId);
            if (!sequenceCauses) {
                if (isCancelled()) { return null; }
                await run(sequence);
            } else {
                skipped.add(i);
                this.logger.log({ cycleId: cycle._id, sequenceId: sequence.sequenceId }, 'sequence skipped (conditions not verified)');
                process.run?.sequences.skipped.push(this._sequenceName(sequence.sequenceId));
                await this._processProgress(sequence.sequenceId, ExecutableAction.OFF, process.mode, undefined, undefined, {
                    kind: ProcessEventKind.SEQUENCE_SKIPPED, runId: process.run?.runId, cycleId: cycle._id,
                    conditions: sequenceCauses.map((x) => x.cause),
                    conditionCauses: sequenceCauses.map((x) => x.condition)
                });
                // uniquement au premier saut : les rattrapages reevaluent en boucle et spammeraient le front
                this._notifyConditionsNotVerified(ExecutableType.SEQUENCE, sequence.sequenceId, process.mode, sequenceCauses);
            }
            // rattrapages des sequences sautees precedentes (i exclu quand elle vient d'etre sautee)
            await runCatchUps(skipped.has(i) ? i - 1 : i);
        }

        if (isCancelled() || !lastRun) { return null; }
        for (const previousId of lastRun.moduleIds) {
            const mod = modules.find(x => x._id === previousId);
            await this.actuatorService.execute(mod, 0);
            try {
                await this._triggerOwningModuleCycle(mod, 0, sourceCycleId, process.mode);
            } catch (error) {
                this.logger.warn({ error, moduleId: previousId, name: mod?.name }, 'module cycle trigger error');
            }
        }
        await this._processProgress(lastRun.sequenceId, ExecutableAction.OFF, process.mode, undefined, undefined,
            this._sequenceEndJournal(lastRun.sequenceId, cycle._id));
        return null;
    }

    // SEQUENCE_ENDED au passage a la suivante / en fin de cycle : duree ecoulee ou SKIP du front
    private _sequenceEndJournal(sequenceId: string, cycleId: string): Partial<ProcessEventData> {
        const isSkippedByUser = this.sequencesSkippedByUser.delete(sequenceId);
        const inverter = this.sequencesSkippedByInverter.get(sequenceId);
        this.sequencesSkippedByInverter.delete(sequenceId);
        const stop: EventStopModel = inverter
            ? { reason: StopReason.INVERTER_MANUAL, by: { source: EventSource.SYSTEM, refId: inverter.id, refName: inverter.name } }
            : { reason: isSkippedByUser ? StopReason.SKIPPED_BY_USER : StopReason.COMPLETED };
        return { runId: this._runOf(cycleId)?.runId, cycleId, stop };
    }

    // lance une sequence (coupe les modules de previousSeq, allume ceux de currentSeq) et attend sa fin :
    // maxDuration ecoulee, SKIP (flag) ou arret du cycle (_clearQueuedSequences reveille le flag).
    private async _runSequence(previousSeq: SequenceExecutionEntry | undefined, currentSeq: SequenceExecutionEntry,
        modules: IActuatorModule[], timings: Map<string, ModuleTimingConfig>, mode: ProcessMode, cycle: CycleModel,
        sourceCycleId?: string, isForced = false): Promise<SequenceExecutionEntry> {
        const ref: { sequenceId: string; flag: Subject<unknown>; timeoutHandle?: NodeJS.Timeout } =
            { sequenceId: currentSeq.sequenceId, flag: new Subject() };
        this.queuedSequences.push(ref);
        const done = firstValueFrom(ref.flag);
        const previousData =
            { id: previousSeq?.sequenceId, moduleIds: previousSeq?.moduleIds ?? [], duration: previousSeq?.securityConfig.maxDuration };
        const currentData =
            { id: currentSeq.sequenceId, moduleIds: currentSeq.moduleIds, duration: currentSeq.securityConfig.maxDuration };
        if (cycle.status === ExecutableStatus.IN_PROCCESS) {
            await this._switchProcess(previousData, currentData, modules, timings, mode, sourceCycleId, cycle._id, isForced);
            ref.timeoutHandle = setTimeout(() => ref.flag.next(null), currentSeq.securityConfig.maxDuration);
            await done;
        }
        clearTimeout(ref.timeoutHandle);
        const index = this.queuedSequences.indexOf(ref);
        if (index >= 0) { this.queuedSequences.splice(index, 1); }
        return currentSeq;
    }

    private async _checkSequenceCondition(sequenceId: string): Promise<boolean> {
        return !(await this._getSequenceConditionCauses(sequenceId));
    }

    // conditions de securite de la sequence, puis variateurs pilotes par la sequence en manuel (sequence sautee)
    private async _getSequenceConditionCauses(sequenceId: string): Promise<ConditionReport | null> {
        const sequence = this.configurationService.sequences.find(x => x._id === sequenceId);
        const conditionCauses = await this._getConditionCauses(sequence?.securityConfig?.conditions,
            (detail) => this.logger.warn({ sequenceId, ...detail }, 'sequence conditions not verified'));
        const inverterCauses = this._getInverterManualCauses(sequence);
        if (inverterCauses.length) {
            this.logger.warn({ sequenceId, inverterIds: inverterCauses.map((x) => x.id) }, 'sequence inverter in manual mode');
        }
        const causes = [...(conditionCauses ?? []), ...inverterCauses];
        return causes.length ? causes : null;
    }

    // une cause par variateur en manuel pilote par la sequence : ses directives ne peuvent pas s'appliquer
    private _getInverterManualCauses(sequence: SequenceModel | undefined): ConditionReport {
        return (sequence?.inverterDirectives ?? [])
            .filter((directive) => this.inverterControlService.isManual(directive.inverterId))
            .map((directive) => {
                const condition: ConditionCauseModel = {
                    elementId: directive.inverterId, elementType: ElementType.INVERTER,
                    elementName: this.inverterControlService.get(directive.inverterId)?.name,
                    operator: '=', expected: 'AUTO', current: 'MANUAL'
                };
                return { id: directive.inverterId, type: 'CONDITION' as const, cause: this._describeCondition(condition), condition };
            });
    }

    // directives des variateurs de la sequence : ON = la sequence prend la main, OFF = rend la main (mode par defaut)
    private _driveSequenceInverters(sequence: SequenceModel, action: ExecutableAction): void {
        for (const directive of sequence.inverterDirectives ?? []) {
            if (action === ExecutableAction.ON) {
                const { inverterId, ...inverterDirective } = directive;
                this.inverterControlService.request(inverterId, inverterDirective, sequence._id, sequence.name)
                    .catch((error) => this.logger.warn({ error, inverterId, sequenceId: sequence._id }, 'inverter directive failed'));
            } else {
                this.inverterControlService.release(directive.inverterId, sequence._id);
            }
        }
    }

    // journal des variateurs ; manuel engage : la sequence qui le pilote est sautee (ses directives ne s'appliquent plus)
    private async _onInverterEvent({ kind, inverter, detail }: InverterControlEvent): Promise<void> {
        if (kind === ProcessEventKind.INVERTER_MANUAL_ENGAGED && detail.sequenceId
            && this.queuedSequences.some((x) => x.sequenceId === detail.sequenceId)) {
            this.logger.log({ inverterId: inverter._id, sequenceId: detail.sequenceId }, 'inverter switched to manual, skipping its sequence');
            this._skipSequence(detail.sequenceId, { id: inverter._id, name: inverter.name });
        }
        const status = this.inverterControlService.getStatus(inverter._id);
        await this._publishStatusEvent({
            elementId: inverter._id,
            date: new Date(),
            elementType: ElementType.INVERTER,
            additionalData: { type: ProcessMode.SYSTEM, kind, name: inverter.name, inverter: detail }
        }, { type: ElementType.INVERTER, id: inverter._id, ...status, ...detail, mode: detail.mode ?? status?.mode });
    }

    private async _switchProcess(previousData: { id: string; moduleIds: string[]; duration: number },
        currentData: { id: string; moduleIds: string[]; duration: number }, modules: IActuatorModule[], timings: Map<string, ModuleTimingConfig>,
        mode: ProcessMode, sourceCycleId?: string, cycleId?: string, isForced = false): Promise<boolean> {

        if (previousData.id) {
            await this._switchModule(previousData.moduleIds, modules, timings, 0, sourceCycleId, mode);
            await this._processProgress(previousData.id, ExecutableAction.OFF, mode, undefined, undefined,
                this._sequenceEndJournal(previousData.id, cycleId)).then(() => true);
        }

        await this._switchModule(currentData.moduleIds, modules, timings, 1, sourceCycleId, mode);
        const run = this._runOf(cycleId);
        const name = this._sequenceName(currentData.id);
        if (run) {
            run.sequences.skipped = run.sequences.skipped.filter((x) => x !== name); // rattrapage / forcee
            run.sequences.run.push(name);
        }
        return this._processProgress(currentData.id, ExecutableAction.ON, mode, null, currentData.duration,
            { runId: run?.runId, cycleId, isForced: isForced || undefined }).then(() => true);
    }

    private async _switchModule(
        moduleIds: string[], modules: IActuatorModule[], timings: Map<string, ModuleTimingConfig>, action: number,
        sourceCycleId?: string, mode?: ProcessMode
    ): Promise<void> {

        await Promise.all(moduleIds.map(async (moduleId) => {
            const mod = modules.find(x => x._id === moduleId);
            const cfg = timings.get(moduleId);
            const waitBefore = action === 1 ? cfg?.waitBeforeExec : cfg?.waitBeforeExecOff;
            const waitAfter = action === 1 ? cfg?.waitAfterExec : cfg?.waitAfterExecOff;
            if (waitBefore > 0) {
                await new Promise(resolve => setTimeout(resolve, waitBefore));
            }
            try {
                await this.actuatorService.execute(mod, action);
            } catch (error) {
                this.logger.warn({ error, moduleId, name: mod?.name }, 'execution module error');
            }
            try {
                await this._triggerOwningModuleCycle(mod, action, sourceCycleId, mode);
            } catch (error) {
                this.logger.warn({ error, moduleId, name: mod?.name }, 'module cycle trigger error');
            }
            if (waitAfter > 0) {
                await new Promise(resolve => setTimeout(resolve, waitAfter));
            }
        }));

    }

    // journal : champs du journal d'execution (kind deduit de l'action s'il est absent) ; sans journal,
    // event historique seul (ex: reset au boot d'un element deja arrete).
    // eslint-disable-next-line complexity
    private async _processProgress(
        id: string, action: ExecutableAction, mode: ProcessMode, causes?: ProcessReport, duration?: number,
        journal?: Partial<ProcessEventData>
    ): Promise<string> {
        const seqFound = this.configurationService.sequences.find(seq => seq._id === id);
        const cycFound = this.configurationService.structure.cycles.find(cyc => cyc._id === id);
        if (!seqFound && !cycFound) {
            return;
        }
        const type: ExecutableType = cycFound ? ExecutableType.CYCLE : ExecutableType.SEQUENCE;
        const startedAt = new Date();
        const status = action === ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        // lu avant que la progression ne soit remise a zero ci-dessous
        const previousStartedAt = (cycFound ?? seqFound).progression?.startedAt;
        let data = { type, id, status, startedAt, duration };
        if (type === ExecutableType.SEQUENCE) {
            const customStacks = seqFound.securityConfig.customStacks;
            for (let index = 0; index < customStacks?.length; index++) {
                const customStack = customStacks[index]; // une fonction surement pour le pid pression sur le variateur
                this.deviceCommandService.execute(customStack.commandId, customStack.deviceId, action === ExecutableAction.ON ? customStack.params : customStack.defaultParams)
                    .catch((error) => this.logger.warn({ error, commandId: customStack.commandId, deviceId: customStack.deviceId }, 'sequence custom stack failed'));
            }
            this._driveSequenceInverters(seqFound, action);

            seqFound.status = status;
            seqFound.progression = status === ExecutableStatus.IN_PROCCESS ? { startedAt, duration } : null;
        } else {
            cycFound.status = status;
            let cycleDuration = 0;
            cycFound.sequences.forEach((x) => cycleDuration = cycleDuration + Number(x.securityConfig.maxDuration))
            cycFound.progression = status === ExecutableStatus.IN_PROCCESS ? { startedAt, duration: cycleDuration } : null;
            data = { type, id, status, startedAt, duration: cycleDuration };
            this.triggerService.onElementValueChanged.next(data);
        }
        const journalData = journal &&
            this._buildProgressJournal(journal, cycFound ?? seqFound, !!cycFound, status, data.duration, previousStartedAt);

        return this._publishStatusEvent({
            elementId: id,
            date: startedAt,
            elementType: type === ExecutableType.SEQUENCE ? ElementType.SEQUENCE : ElementType.CYCLE,
            additionalData: {
                type: mode,
                value: data.status,
                status: data.status,
                startedAt: data.startedAt,
                duration: data.duration,
                causes,
                ...journalData
            }
        }, data);
    }

    // complete le journal d'un changement de statut : kind par defaut, nom, durees prevue / reelle
    private _buildProgressJournal(journal: Partial<ProcessEventData>, element: { name: string }, isCycle: boolean,
        status: ExecutableStatus, plannedDuration: number, previousStartedAt: Date | undefined): Partial<ProcessEventData> {
        const isOn = status === ExecutableStatus.IN_PROCCESS;
        const defaultKind = isCycle
            ? (isOn ? ProcessEventKind.CYCLE_STARTED : ProcessEventKind.CYCLE_ENDED)
            : (isOn ? ProcessEventKind.SEQUENCE_STARTED : ProcessEventKind.SEQUENCE_ENDED);
        const result: Partial<ProcessEventData> = { kind: defaultKind, name: element.name, plannedDuration, ...journal };
        if (result.kind === ProcessEventKind.CYCLE_ENDED || result.kind === ProcessEventKind.SEQUENCE_ENDED) {
            const endedAt = new Date();
            result.endedAt = endedAt;
            if (previousStartedAt) {
                result.runStartedAt = new Date(previousStartedAt);
                result.realDuration = endedAt.getTime() - result.runStartedAt.getTime();
            }
        }
        return result;
    }
    /**
     * Écrit les paramètres Fgg.ii de l'onduleur via sa register map (bloc = code du paramètre,
     * opération 'set', persist = écriture EEPROM). Paramètre inconnu ou valeur hors plage : ignoré.
     */
    public async applyInverterConfig(inverterId: string, params: InverterConfigParam[]): Promise<void> {
        return this.inverterControlService.writeParameters(inverterId, params);
    }

    private _needConfirmation(processModel: ProcessModel, causes: { type: CauseType; cause: string }[],
        confirmation: ConfirmationRequestModel): Promise<string> {
        return this._publishWaitingStatus(processModel, ExecutableStatus.WAITTING_CONFIRMATION, causes, confirmation);
    }

    // statut pose de facon synchrone (avant toute attente) : un demarrage qui suit ne doit pas etre ecrase
    private _publishWaitingStatus(processModel: ProcessModel, status: ExecutableStatus.WAITTING_CONFIRMATION | ExecutableStatus.QUEUED,
        causes: { type: CauseType; cause: string }[], confirmation?: ConfirmationRequestModel, waitingFor?: string[]): Promise<string> {
        const data = { type: ExecutableType.CYCLE, id: processModel.cycle._id, status, causes, confirmation };
        const cycFound = this.configurationService.structure.cycles.find((cyc) => cyc._id === data.id);
        if (cycFound) {
            cycFound.status = status;
        }
        return this._publishStatusEvent({
            elementId: data.id,
            date: new Date(),
            elementType: ElementType.CYCLE,
            additionalData: {
                type: processModel.mode, value: data.status, status: data.status, causes,
                ...ProcessService._runJournal(processModel.run),
                // demande : detail tel que calcule par l'arbitrage ; file : confirmation du run (reponse QUEUE)
                confirmation: confirmation ?? (processModel.run?.confirmation && { ...processModel.run.confirmation }),
                kind: status === ExecutableStatus.QUEUED ? ProcessEventKind.CYCLE_QUEUED : ProcessEventKind.CONFIRMATION_REQUESTED,
                name: processModel.cycle.name,
                waitingFor
            }
        }, data);
    }

    private static _ofNull<T>(): Observable<T> {
        return of(null as T);
    }

}

