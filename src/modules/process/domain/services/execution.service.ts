/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { delayWhen, from, map, mergeMap, Observable, of, Subject, tap } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ProcessInvalidTypeError } from '../errors/process-invalid-type-error';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ExecutableAction,
    ExecutableStatus,
    ProcessMode,
    ProcessType,
    CycleType,
    SequenceExecutionEntry
} from '../interfaces/executable.interface';
import { ActuatorType, IActuatorModule } from '../interfaces/actuator-module.interface';
import { ComActuatorConfigModel } from '../models/actuator.model';
import { ComRequestType } from '../interfaces/com-request.interface';
import { ComRequestConfigModel, ComRequestModel } from '../models/com-request.model';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ModuleTimingConfig } from '../models/sequence.model';
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
import { ElementType, EventModel } from '../models/event.model';
import { type InverterConfigParam, ModbusService } from './modbus.service';
import { TriggerService } from './trigger.service';
import { ScheduleService } from './schedule.service';
import { TriggerModel } from '../models/trigger.model';
import { buildOverrideParams } from '../utils/build-override-params.util';
import { evaluateConditions } from '../utils/evaluate-conditions.util';

type ProcessReport = { id: string; type: ProcessType; cause: string }[];

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
    public constructor(
        private schedulerRegistry: SchedulerRegistry,
        private configurationService: StructureService,
        private wsService: SocketIoClientProxyService,
        private cycleRepository: CycleRepository,
        private valueRepository: ValueRepository,
        private eventRepository: EventRepository,
        private modBusService: ModbusService,
        private actuatorService: ActuatorService,
        private comRequestRepository: ComRequestRepository,
        @Inject(forwardRef(() => TriggerService)) private triggerService: TriggerService,
        @Inject(forwardRef(() => ScheduleService)) private scheduleService: ScheduleService,
        private readonly logger: Logger
    ) {

    }

    public async execute(process: ProcessModel): Promise<void> {
        this._initializeProcess(process);
        return await this._manageProcessType(process);
    }

    private _resolveActuators(): Promise<Map<string, IActuatorModule>> {
        return this.actuatorService.resolve(this.configurationService.structure.getModuleIds());
    }

    private _buildManualPushButtonReport(process: ProcessModel): ProcessReport {
        if (process.mode === ProcessMode.TRIGGER && process.cycle.type === CycleType.MODULE && process.type === ProcessType.FORCE) {
            return [{ id: process.id, type: process.type, cause: 'manual push button : ' + process.cycle.name }];
        }
        return [];
    }

    private _publishStatusEvent(eventPayload: EventModel, wsData: unknown): Promise<string> {
        return this.eventRepository.save(eventPayload).then(() => {
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(wsData) }, true)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (local)'));
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(wsData) }, false)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (remote)'));
            return 'sent';
        });
    }

    public async reset(process: ProcessModel, causes?: ProcessReport): Promise<void> {
        const index = this.processList.map(x => x.cycle._id).indexOf(process.cycle._id);
        this._clearQueuedSequences(process);
        // le statut peut etre reserve (IN_PROCCESS) avant que processList ne contienne l'entree
        // (voir la reservation synchrone de la regle 3) : sans ce fallback, un OFF arrivant dans
        // cette fenetre ne trouverait rien dans processList et ne ferait rien.
        if (index > -1 || process.cycle.status === ExecutableStatus.IN_PROCCESS) {
            this.processList[index]?.instance?.unsubscribe();
            // flip immediatement (avant tout await) : ce champ est partage (meme CycleModel que
            // configurationService.structure.cycles, cf. _initializeProcess) et sert de signal
            // d'annulation pour toute continuation asynchrone deja en vol (tap de reservation dans
            // _executeWithActuators, ref.resume()/_checkSequenceCondition().then() dans
            // _createExecObs) qui ne passe pas par processList[index].instance.unsubscribe() -
            // le fixer plus tard (apres les await ci-dessous, comme avant) laissait une fenetre ou
            // ces continuations voyaient encore IN_PROCCESS alors que l'arret etait deja decide.
            process.cycle.status = ExecutableStatus.STOPPED;

            // libere d'abord tout cycle MODULE qui n'est IN_PROCCESS que parce que CE cycle l'a
            // auto-demarre (regle 2, mode AUTO + sourceCycleId le pointant) et qui n'a jamais ete
            // repris depuis par un declenchement independant (mode different) - sinon il reste
            // orphelin indefiniment (status/processList perimes, actuator pourtant deja coupe
            // physiquement plus bas) et _isActuatorStillInUse bloque a tort son actuator pour toute
            // tentative future de l'arreter. Un cycle MODULE repris manuellement/schedule/trigger a
            // un mode different et reste protege (cf. test "actuator still used by another active
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
            await this._processProgress(process.cycle._id, ExecutableAction.OFF, process.mode, causes).then(() => true);
            for (const sequence of process.cycle.sequences) {
                if (sequence.status !== ExecutableStatus.STOPPED) {
                    await this._processProgress(sequence._id, ExecutableAction.OFF, process.mode, causes).then(() => true);
                }
            }
            // regle 3 : verifie/eteint le Group parent si tous ses enfants sont maintenant stoppes
            // (voir _syncParentGroupOffIfAllChildrenStopped) ; volontairement DANS ce if (uniquement
            // quand ce cycle vient reellement de transiter vers STOPPED, pas a chaque appel no-op).
            await this._syncParentGroupOffIfAllChildrenStopped(process.cycle._id);


        }
        // unref() : ce rappel differe est "fire and forget", il ne doit pas a lui seul empecher
        // le processus de s'arreter (ex: extinction propre, ou fuite de ce timer dans les tests).
        setTimeout(() => {
        }, 20000).unref();

    }

    // regle 2/3/4 (arret d'un MODULE) : un actuator partage ne doit etre coupe que si plus aucun
    // CYCLE ni MODULE actif (autre que celui qu'on est en train d'arreter) ne le reference encore.
    // on exclut aussi les entrees dont le cycle n'est pas IN_PROCCESS (ex: CONFIRMATION, meme filtre
    // que _getConflictedExecutables) : elles n'ont jamais reellement pilote l'actuator.
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
    // (regle 2, mode AUTO) et qui n'a jamais ete repris depuis independamment (auquel cas son
    // entree processList porterait un mode different, cf. test "independently triggered"). Un
    // reset() complet (status/processList/progress) est applique a chacun, pas seulement une
    // coupure d'actuator, pour que son statut reflete correctement qu'il ne tourne plus.
    private async _releaseAutoStartedModules(sourceCycleId: string): Promise<void> {
        const orphaned = this.processList.filter((proc) =>
            proc.cycle.type === CycleType.MODULE &&
            proc.mode === ProcessMode.AUTO &&
            proc.sourceCycleId === sourceCycleId &&
            proc.cycle.status === ExecutableStatus.IN_PROCCESS
        );
        for (const proc of orphaned) {
            const report: ProcessReport = [{ id: proc.id, type: ProcessType.FORCE, cause: 'owning cycle stopped : ' + sourceCycleId }];
            await this.reset(proc, report);
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
            process.type = ProcessType.FORCE;
            process.mode = ProcessMode.MANUAL;
            await this.execute(process);
        }
    }

    // mapping sortie physique IO module -> actuator COM (via config.deviceId + config.actions[0].digitalPort)
    // -> pilotage du cycle MODULE qui possede cet actuator, sur le meme principe que la regle 2
    // (_triggerOwningModuleCycle) mais declenche par une lecture materielle Modbus plutot que par
    // un CYCLE en cours d'execution. mode = TRIGGER (pas AUTO, contrairement a
    // _triggerOwningModuleCycle) : ce chemin n'a pas de cycle CYCLE amont a proteger, donc la regle 1
    // (_cascadeStopConflictingCycles, gardee par mode !== AUTO) doit s'appliquer normalement et
    // arreter tout cycle CYCLE en cours partageant un actuator COM/RPI avec ce cycle MODULE.
    // Le garde no-op ci-dessous (etat deja atteint) est indispensable : quand la regle 2 demarre elle-
    // meme ce cycle MODULE (actuator commute par un CYCLE deja en cours), l'ecriture Modbus physique
    // qui en resulte est ensuite re-detectee ~500ms plus tard par monitorDigitalOutputs, qui rappelle
    // cette methode pour son propre echo. Sans ce garde, ce second appel (sans sourceCycleId)
    // declencherait la regle 1 et arreterait a tort le CYCLE qui vient de demarrer ce MODULE.
    public async executeModuleCycleForDigitalOutput(deviceId: string, channel: number, isOn: boolean): Promise<void> {
        const candidates = this.configurationService.structure.actuators.filter((a) => {
            if (a.type !== ActuatorType.COM) return false;
            const config = a.config as ComActuatorConfigModel;
            return config.deviceId === deviceId && config.actions?.[0]?.portNumber === channel;
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

        // la direction OUTPUT n'est plus stockee sur ComActuatorActionConfig : elle est deduite du
        // ComRequestModel associe (type DIGITAL_OUTPUT), recupere via comRequestId.
        const comRequests = await this.comRequestRepository.get() as ComRequestModel[];
        const isDigitalOutput = candidates.some((a) => {
            const comRequestId = (a.config as ComActuatorConfigModel).actions?.[0]?.comRequestId;
            return comRequests.find((comRequest) => comRequest._id === comRequestId)?.type?.includes(ComRequestType.DIGITAL_OUTPUT);
        });
        if (!isDigitalOutput) return;

        const moduleProcess = new ProcessModel();
        moduleProcess.cycle = moduleCycle;
        moduleProcess.action = isOn ? ExecutableAction.ON : ExecutableAction.OFF;
        moduleProcess.type = ProcessType.FORCE;
        moduleProcess.mode = ProcessMode.TRIGGER;
        await this.execute(moduleProcess);
    }

    private _clearQueuedSequences(process: ProcessModel): void {
        process.cycle.sequences.forEach(sequence => {
            const index = this.queuedSequences.findIndex(x => x.sequenceId === sequence._id);
            if (index >= 0) {
                // le timer d'avancement vers la sequence suivante (_createExecObs) n'est pas relie
                // au cycle de vie de la subscription RxJS : sans ce clearTimeout explicite il reste
                // arme en arriere-plan apres un arret (cf. commentaire plus haut dans le fichier de
                // test associe documentant la meme fuite).
                clearTimeout(this.queuedSequences[index].timeoutHandle);
                this.queuedSequences.splice(index, 1);
            }
        });
    }

    private _removeIgnoredProcess(process: ProcessModel): Promise<string> {
        const index = this.processList.findIndex(x => x.cycle._id === process.cycle._id);
        if (index > -1) {
            this.processList.splice(index, 1);
        }

        const data = { type: ExecutableType.CYCLE, id: process.cycle._id, status: ExecutableStatus.STOPPED };
        return this._publishStatusEvent({
            elementId: data.id,
            date: new Date(),
            elementType: ElementType.CYCLE,
            additionalData: { type: process.mode, value: data.status, status: data.status }
        }, data);
    }

    private async _initialReset(cycleModel: CycleModel): Promise<void> {
        const actuators = await this._resolveActuators();
        await this.actuatorService.reset(cycleModel.getModules(actuators));
        cycleModel.status = ExecutableStatus.STOPPED;

        for (const sequence of cycleModel.sequences) {
            await this._processProgress(sequence._id, ExecutableAction.OFF, ProcessMode.SYSTEM).then(() => true);
        }

        await this._processProgress(cycleModel._id, ExecutableAction.OFF, ProcessMode.SYSTEM);
    }

    private _initializeProcess(process: ProcessModel): void {
        const struct = this.configurationService.structure;
        const currentCycle = struct.cycles.find(x => x._id === process.cycle._id);
        if (!currentCycle && process.type === ProcessType.SKIP) {
            //skip concerne les sequences ... donc pas de cycle existant
            process.id = process.cycle._id;
        } else if (!currentCycle && process.type === ProcessType.FORCE && this.queuedSequences.find(x => x.sequenceId === process.cycle._id)) {
            // force peut aussi confirmer une sequence en attente de confirmation (condition de securite verifiee) ... donc pas de cycle existant
            process.id = process.cycle._id;
        } else if (currentCycle) {
            process.cycle = currentCycle;
        } else {
            throw new StructureInvalidError();
        }
    }

    private async _manageProcessType(process: ProcessModel): Promise<void> {
        if (process.type === ProcessType.SKIP) {
            const sequenceSkipFlag = this.queuedSequences.find(x => x.sequenceId === process.id);
            sequenceSkipFlag.flag.next(null);
        } else if (process.type === ProcessType.FORCE) {
            const queuedSequence = process.id && this.queuedSequences.find(x => x.sequenceId === process.id);
            if (queuedSequence?.resume) {
                queuedSequence.resume();
                return;
            }
            if (process.cycle.type === CycleType.MODULE && process.mode !== ProcessMode.AUTO) {
                await this._cascadeStopConflictingCycles(process);
            }
            if (process.cycle.type === CycleType.CYCLE && process.mode !== ProcessMode.AUTO && process.action === ExecutableAction.OFF) {
                await this._cascadeStopOwningModules(process);
            }
            if (process.action === ExecutableAction.OFF) {
                let report: ProcessReport;
                if (process.sourceCycleId) {
                    report = [];
                    report.push({ id: process.id, type: process.type, cause: 'stopped by parent : ' + this.configurationService.structure.cycles.find(x => x._id === process.sourceCycleId)?.name });
                } else {
                    report = this._buildManualPushButtonReport(process);
                }
                if (process.cycle.type === CycleType.GROUP) {
                    await this._stopGroupChildren(process.cycle);
                }
                await this.reset(process, report);
                // regle child manuel (OFF) : un arret MANUEL direct d'un enfant de Group (pas via
                // _stopChildCycle, qui est en mode=AUTO) doit desactiver ses propres trigger/schedule
                // pour empecher un redemarrage automatique - meme geste que _stopGroupChildren fait
                // pour TOUS les enfants quand c'est le Group qui s'arrete. No-op silencieux si
                // l'enfant n'a ni trigger ni schedule.
                if (process.mode === ProcessMode.MANUAL && process.cycle.parentCycleId) {
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
                    // existing.mode === AUTO : ne transfere que d'un proprietaire AUTO a un autre -
                    // un MODULE deja repris independamment (MANUAL/SCHEDULED/TRIGGER, cf. test
                    // "independently triggered") ne doit jamais se faire reattribuer silencieusement
                    // par la cascade rule 2 d'un CYCLE qui partage juste le meme actuator.
                    if (process.cycle.type === CycleType.MODULE && process.mode === ProcessMode.AUTO &&
                        process.sourceCycleId && process.sourceCycleId !== process.cycle._id) {
                        const existing = this.processList.find(x => x.cycle._id === process.cycle._id);
                        if (existing && existing.mode === ProcessMode.AUTO && existing.sourceCycleId !== process.sourceCycleId) {
                            existing.sourceCycleId = process.sourceCycleId;
                        }
                    }
                    return; // regle 3 : ON sur un cycle deja en cours -> no-op silencieux
                }
                // regle child manuel (ON) : miroir exact de _startGroupChildren pour un ON MANUEL
                // envoye directement sur un enfant de Group (pas via _startChildCycle, qui est en
                // mode=AUTO). Si cet enfant possede son propre trigger/schedule, on ne demarre
                // JAMAIS ses sequences ni ne touche au Group parent : on se contente de lever la
                // pause, exactement comme le ferait le Group en le "demarrant". S'il ne possede ni
                // trigger ni schedule, on tombe dans le pipeline normal ci-dessous (deja existant).
                if (process.mode === ProcessMode.MANUAL && process.cycle.parentCycleId) {
                    const hasTriggerOrSchedule =
                        !!this._getChildTriggers(process.cycle._id).length || !!this._getChildSchedules(process.cycle._id).length;
                    if (hasTriggerOrSchedule) {
                        await this._setChildTriggersAndSchedulesPaused(process.cycle._id, false);
                        return; // ne jamais demarrer le cycle ni le Group parent dans ce cas
                    }
                }
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
        } else if (process.type === ProcessType.QUEUED) {
            throw new Error('Method not implemented.');
        } else if (process.type === ProcessType.IGNORE) {
            await this._removeIgnoredProcess(process);
        } else if (process.type === ProcessType.CONFIRMATION) {
            return;
        } else if (process.type === ProcessType.INIT) {
            await this._manageProcessMode(process);
        } else {
            throw new ProcessInvalidTypeError();
        }
    }

    private async _manageProcessMode(process: ProcessModel): Promise<void> {
        const cyclePriority = process.cycle.modePriority.find(x => x.mode === process.mode);
        const report: ProcessReport = [];
        const conflictedProcesses: ProcessModel[] = await this._getConflictedExecutables(process);
        if (process.schedule?.shouldConfirmation) {
            process.type = ProcessType.CONFIRMATION;
            this.processList.push(process);
            report.push({ id: process.id, type: process.type, cause: 'schedule triggered : ' + process.cycle.name });
        } else
             if (!conflictedProcesses.length) {
            process.type = ProcessType.FORCE;
        }
        for (const proc of conflictedProcesses) {
            if (cyclePriority.priority < proc.cycle.modePriority.find((x) => x.mode === proc.mode).priority) {
                if ((process.mode === ProcessMode.SCHEDULED || process.mode === ProcessMode.TRIGGER) && process.schedule.shouldConfirmation) {
                    process.type = ProcessType.CONFIRMATION;
                } else {
                    process.type = ProcessType.FORCE;
                }

                report.push({ id: proc.id, type: process.type, cause: 'conflicted with cycle : ' + proc.cycle.name });
            } else {
                const processAlreadyExist = this.processList.find(x => x.cycle._id === process.cycle._id);
                process.type = ProcessType.CONFIRMATION;

                if (!processAlreadyExist) {
                    this.processList.push(process);
                    report.push({ id: proc.id, type: process.type, cause: 'conflicted with cycle : ' + proc.cycle.name });
                }
                break;
            }
        }

        await this._applyCycleConditionsGate(process, report);

        const confirmationType = report.find((x) => x.type === ProcessType.CONFIRMATION);
        if (confirmationType) {
            process.type = ProcessType.CONFIRMATION;
            this._needConfirmation(process, report);
        } else {
            this._manageProcessType(process);
        }
    }

    private async _applyCycleConditionsGate(process: ProcessModel, report: ProcessReport): Promise<void> {
        const isConditionsVerified = await evaluateConditions(process.cycle.conditions, (elementId) => this.valueRepository.getDeviceValue(elementId));
        if (isConditionsVerified) {
            return;
        }
        process.type = ProcessType.CONFIRMATION;
        if (!this.processList.find(x => x.cycle._id === process.cycle._id)) {
            this.processList.push(process);
        }
        const cause = 'condition non vérifiée pour le cycle : ' + process.cycle.name;
        report.push({ id: process.cycle._id, type: ProcessType.CONFIRMATION, cause });
    }

    private _executeProcess(process: ProcessModel): void {

        process.instance = this._execute(process).subscribe(
            {
                next: async () => {
                    const report: ProcessReport = [];
                    report.push({ id: process.id, type: process.type, cause: 'end lifecycle normal stop : ' + process.cycle.name });
                    await this.reset(process, report);
                },
                error: async (_err) => {
                    this.logger.error({ err: _err }, 'execution error');
                    const report: ProcessReport = [];
                    report.push({ id: process.id, type: process.type, cause: 'abnormal stop : ' + process.cycle.name + 'detail:=>' + _err });
                    await this.reset(process, report);
                }
            }
        );
    }

    // orchestration Group : le parent marque son propre statut/progress puis demarre ses enfants
    // en tache de fond (ne bloque pas execute(), au meme titre que _executeProcess pour un CYCLE).
    private async _executeGroupOn(process: ProcessModel): Promise<void> {
        this.processList.push(process);
        await this._processProgress(process.cycle._id, ExecutableAction.ON, process.mode, []);
        const token = Symbol();
        this.groupRunTokens.set(process.cycle._id, token);
        await this._startGroupChildren(process.cycle, token);
    }

    // groupStartsInProgress est marque pendant toute la duree de la sequence de demarrage : un
    // enfant en waitForCompletion qui s'arrete "normalement" (pour laisser la place au suivant) ne
    // doit pas etre lu par _syncParentGroupOffIfAllChildrenStopped comme "tous les enfants sont
    // stoppes, eteindre le Group" - ce serait une fausse lecture puisque le prochain enfant n'a pas
    // encore eu sa chance de demarrer. Le try/finally est isole dans cette methode (plutot que
    // directement autour de la boucle de _runGroupChildrenSequence) pour ne pas ajouter un niveau
    // d'imbrication supplementaire a une boucle deja profondement imbriquee.
    private async _startGroupChildren(groupCycle: CycleModel, token: symbol): Promise<void> {
        this.groupStartsInProgress.add(groupCycle._id);
        try {
            await this._runGroupChildrenSequence(groupCycle, token);
        } finally {
            this.groupStartsInProgress.delete(groupCycle._id);
        }
    }

    // parcourt les enfants dans l'ordre (config.order), en respectant isSkipped/delayBefore/
    // delayAfter/waitForCompletion ; s'arrete si le groupe a recu un OFF entretemps (token invalide).
    private async _runGroupChildrenSequence(groupCycle: CycleModel, token: symbol): Promise<void> {
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
                await this._startChildCycle(child, groupCycle._id);
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
        groupOffProcess.type = ProcessType.FORCE;
        groupOffProcess.mode = ProcessMode.SYSTEM;
        await this.execute(groupOffProcess);
    }

    private async _startChildCycle(child: CycleModel, sourceCycleId: string): Promise<void> {
        if (child.status === ExecutableStatus.IN_PROCCESS) {
            return;
        }
        const childProcess = new ProcessModel();
        childProcess.cycle = child;
        childProcess.action = ExecutableAction.ON;
        childProcess.type = ProcessType.FORCE;
        childProcess.mode = ProcessMode.AUTO;
        childProcess.sourceCycleId = sourceCycleId;
        await this.execute(childProcess);
    }

    private async _stopChildCycle(child: CycleModel, sourceCycleId: string): Promise<void> {
        const childProcess = new ProcessModel();
        childProcess.cycle = child;
        childProcess.action = ExecutableAction.OFF;
        childProcess.type = ProcessType.FORCE;
        childProcess.mode = ProcessMode.SYSTEM;
        childProcess.sourceCycleId = sourceCycleId;
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
            report.push({ id: proc.id, type: process.type, cause: 'stopped by conflicted cycle : ' + process.cycle.name });
            await this.reset(proc, report);
        }
        if (process.type === ProcessType.FORCE) {
            const foundIndex = this.processList.findIndex(x => x.cycle._id === process.cycle._id && x.type === ProcessType.CONFIRMATION);
            if (foundIndex > -1) {
                this.processList.splice(foundIndex, 1);
            }
        }
    }

    // un cycle MODULE partageant un actuator n'est jamais un "conflit" a arbitrer ici (priorite/
    // confirmation) : rule 1 (_cascadeStopConflictingCycles) et rule 2 (_triggerOwningModuleCycle)
    // gerent deja entierement la relation CYCLE<->MODULE sur cet actuator, de facon automatique et
    // sans jamais demander de confirmation - y compris pour un cycle demarre manuellement (type
    // FORCE direct, qui ne passe meme pas par _manageProcessMode). Un cycle demarre via son propre
    // schedule/trigger (mode SCHEDULED/TRIGGER, type INIT -> _manageProcessMode) doit se comporter
    // de la meme facon : un MODULE actif sur le meme actuator ne doit jamais a lui seul declencher
    // une demande de confirmation.
    private async _getConflictedExecutables(process: ProcessModel): Promise<ProcessModel[]> {
        const conflictedExecutable: ProcessModel[] = [];
        const actuators = await this._resolveActuators();
        const modules = process.cycle.getModules(actuators);
        modules.forEach((module) => {
            this.processList.forEach((proc) => { // and not in confirmation state
                const isConflicting = proc.cycle._id !== process.cycle._id &&
                    process.type !== ProcessType.CONFIRMATION && proc.type !== ProcessType.CONFIRMATION
                    && proc.cycle.type !== CycleType.MODULE && proc.cycle.exists(module, actuators)
                    && !conflictedExecutable.find((x) => x.cycle._id === proc.cycle._id) && process.action !== 'OFF';
                if (isConflicting) {
                    conflictedExecutable.push(proc);
                }
            });
        });

        return conflictedExecutable;
    }

    // regle 1 : un ON/OFF sur un cycle MODULE stoppe immediatement (sans passer par la priorite
    // / confirmation) tous les cycles CYCLE partageant au moins un actuator COM/RPI avec lui.
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
            report.push({ id: proc.id, type: process.type, cause: 'single module stop  : ' + process.cycle.name });

            await this.reset(proc, report);
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
            report.push({ id: proc.id, type: process.type, cause: 'parent cycle stop : ' + process.cycle.name });

            await this.reset(proc, report);
        }
    }

    // regle 2 : trouve le cycle MODULE possedant cet actuator, et pilote son ON/OFF au moment
    // precis ou le cycle CYCLE (sourceCycleId) commute effectivement cet actuator.
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
        moduleProcess.type = ProcessType.FORCE;
        moduleProcess.mode = ProcessMode.AUTO;
        moduleProcess.sourceCycleId = sourceCycleId;
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
        let obs: Observable<SequenceExecutionEntry> =
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

                    await this._processProgress(process.cycle._id, ExecutableAction.ON, process.mode, report);
                }));

        executionLst.forEach((sequence, index) => {
            const chainObs = this._createExecObs(executionLst[index - 1], sequence, modules, timings, process.mode, process.cycle, sourceCycleId);
            obs = obs.pipe(mergeMap(() => chainObs));
        });

        return obs.pipe(
            tap(async (previousSeq) => {
                for (const previousName of previousSeq.names) {
                    const mod = modules.find(x => x.name === previousName);
                    await this.actuatorService.execute(mod, 0);
                    try {
                        await this._triggerOwningModuleCycle(mod, 0, sourceCycleId, process.mode);
                    } catch (error) {
                        this.logger.warn({ error, name: previousName }, 'module cycle trigger error');
                    }
                }
            }),
            mergeMap((previousSeq) => {
                const index = this.queuedSequences.findIndex(x => x.sequenceId === previousSeq?.sequenceId);
                if (index >= 0) {
                    this.queuedSequences.splice(index, 1);
                }
                return from(this._processProgress(previousSeq.sequenceId, ExecutableAction.OFF, process.mode)).pipe(mergeMap(() => of(null)));
            })
        );
    }

    private _createExecObs(
        previousSeq: SequenceExecutionEntry,
        currentSeq: SequenceExecutionEntry,
        modules: IActuatorModule[],
        timings: Map<string, ModuleTimingConfig>,
        mode: ProcessMode,
        cycle: CycleModel,
        sourceCycleId?: string
    ): Observable<SequenceExecutionEntry> {
        const ref: { sequenceId: string; flag: Subject<unknown>; resume?: () => void; timeoutHandle?: NodeJS.Timeout } =
            { sequenceId: currentSeq.sequenceId, flag: new Subject() };
        return of(previousSeq?.names || []).pipe(
            mergeMap((previousNames) => {
                return of(currentSeq.names).pipe(
                    map((currentNames) => {
                        const index = this.queuedSequences.findIndex(x => x.sequenceId === previousSeq?.sequenceId);
                        if (index >= 0) {
                            this.queuedSequences.splice(index, 1);
                        }
                        this.queuedSequences.push(ref);
                        ref.resume = (): void => {
                            // le cycle a pu etre stoppe (reset()) pendant que _checkSequenceCondition
                            // ci-dessous etait en vol, ou depuis que ce timer a ete arme : ni l'un ni
                            // l'autre ne passe par processList[index].instance.unsubscribe(), donc rien
                            // ne les annule automatiquement - reverifier le statut partage du cycle
                            // avant de piloter reellement les actionneurs de la sequence suivante.
                            if (cycle.status !== ExecutableStatus.IN_PROCCESS) {
                                return;
                            }
                            const previousData =
                                { id: previousSeq?.sequenceId, names: previousNames, duration: previousSeq?.securityConfig.maxDuration };
                            const currentData =
                                { id: currentSeq.sequenceId, names: currentNames, duration: currentSeq.securityConfig.maxDuration };
                            this._switchProcess(previousData, currentData, modules, timings, mode, sourceCycleId);
                            ref.timeoutHandle = setTimeout(() => {
                                ref.flag.next(null);
                            }, currentSeq.securityConfig.maxDuration);
                        };
                        this._checkSequenceCondition(ref.sequenceId).then((skipExecSequence) => {
                            if (cycle.status !== ExecutableStatus.IN_PROCCESS) {
                                return;
                            }
                            if (!skipExecSequence) {
                                this._needSequenceConfirmation(ref.sequenceId, mode);
                            } else {
                                ref.resume();
                            }
                        });
                        return currentSeq;
                    })
                );
            }),
            delayWhen(() => ref.flag)
        );
    }

    private _checkSequenceCondition(sequenceId: string): Promise<boolean> {
        const sequence = this.configurationService.sequences.find(x => x._id === sequenceId);
        return evaluateConditions(sequence?.securityConfig?.conditions, (elementId) => this.valueRepository.getDeviceValue(elementId));
    }

    private async _switchProcess(previousData: { id: string; names: string[]; duration: number },
        currentData: { id: string; names: string[]; duration: number }, modules: IActuatorModule[], timings: Map<string, ModuleTimingConfig>,
        mode: ProcessMode, sourceCycleId?: string): Promise<boolean> {

        if (previousData.id) {
            await this._switchModule(previousData.names, modules, timings, 0, sourceCycleId, mode);
            await this._processProgress(previousData.id, ExecutableAction.OFF, mode).then(() => true);
        }

        await this._switchModule(currentData.names, modules, timings, 1, sourceCycleId, mode);
        return this._processProgress(currentData.id, ExecutableAction.ON, mode, null, currentData.duration).then(() => true);
    }

    private async _switchModule(
        dataNames: string[], modules: IActuatorModule[], timings: Map<string, ModuleTimingConfig>, action: number,
        sourceCycleId?: string, mode?: ProcessMode
    ): Promise<void> {

        await Promise.all(dataNames.map(async (dataName) => {
            const mod = modules.find(x => x.name === dataName);
            const cfg = timings.get(dataName);
            const waitBefore = action === 1 ? cfg?.waitBeforeExec : cfg?.waitBeforeExecOff;
            const waitAfter = action === 1 ? cfg?.waitAfterExec : cfg?.waitAfterExecOff;
            if (waitBefore > 0) {
                await new Promise(resolve => setTimeout(resolve, waitBefore));
            }
            try {
                await this.actuatorService.execute(mod, action);
            } catch (error) {
                this.logger.warn({ error, name: dataName }, 'execution module error');
            }
            try {
                await this._triggerOwningModuleCycle(mod, action, sourceCycleId, mode);
            } catch (error) {
                this.logger.warn({ error, name: dataName }, 'module cycle trigger error');
            }
            if (waitAfter > 0) {
                await new Promise(resolve => setTimeout(resolve, waitAfter));
            }
        }));

    }

    // eslint-disable-next-line complexity
    private async _processProgress(
        id: string, action: ExecutableAction, mode: ProcessMode, causes?: ProcessReport, duration?: number
    ): Promise<string> {
        const seqFound = this.configurationService.sequences.find(seq => seq._id === id);
        const cycFound = this.configurationService.structure.cycles.find(cyc => cyc._id === id);
        if (!seqFound && !cycFound) {
            return;
        }
        const type: ExecutableType = cycFound ? ExecutableType.CYCLE : ExecutableType.SEQUENCE;
        const startedAt = new Date();
        const status = action === ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        let data = { type, id, status, startedAt, duration };
        if (type === ExecutableType.SEQUENCE) {
            const customStacks = seqFound.securityConfig.customStacks;
            for (let index = 0; index < customStacks?.length; index++) {
                const customStack = customStacks[index];
                const comRequest: ComRequestModel = await this.comRequestRepository.get(customStack.comRequestId) as ComRequestModel;
                this.modBusService.execute(comRequest, action === ExecutableAction.ON ? customStack.params : customStack.defaultParams);
            }

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
                causes: causes
            }
        }, data);
    }
    public async applyInverterConfig(inverterId: string, params: InverterConfigParam[]): Promise<void> {
        return this.modBusService.applyInverterConfig(inverterId, params);
    }

    private _needConfirmation(processModel: ProcessModel, causes: { type: ProcessType; cause: string }[]): Promise<string> {
        const data = { type: ExecutableType.CYCLE, id: processModel.cycle._id, status: ExecutableStatus.WAITTING_CONFIRMATION, causes };
        const cycFound = this.configurationService.structure.cycles.find((cyc) => cyc._id === data.id);
        if (cycFound) {
            cycFound.status = ExecutableStatus.WAITTING_CONFIRMATION;
        }
        return this._publishStatusEvent({
            elementId: data.id,
            date: new Date(),
            elementType: ElementType.CYCLE,
            additionalData: { type: processModel.mode, value: data.status, status: data.status, causes: causes }
        }, data);
    }

    private _needSequenceConfirmation(sequenceId: string, mode: ProcessMode): Promise<string> {
        const sequence = this.configurationService.sequences.find(x => x._id === sequenceId);
        const cause = 'condition de sécurité vérifiée pour la séquence : ' + (sequence?.name ?? sequenceId);
        const causes = [{ id: sequenceId, type: ProcessType.CONFIRMATION, cause }];
        const data = { type: ExecutableType.SEQUENCE, id: sequenceId, status: ExecutableStatus.WAITTING_CONFIRMATION, causes };
        if (sequence) {
            sequence.status = ExecutableStatus.WAITTING_CONFIRMATION;
        }
        return this._publishStatusEvent({
            elementId: data.id,
            date: new Date(),
            elementType: ElementType.SEQUENCE,
            additionalData: { type: mode, value: data.status, status: data.status, causes }
        }, data);
    }

    private static _ofNull<T>(): Observable<T> {
        return of(null as T);
    }

}

