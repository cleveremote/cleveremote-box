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
    CycleType
} from '../interfaces/executable.interface';
import { ActuatorType, IActuatorModule } from '../interfaces/actuator-module.interface';
import { ComActuatorConfigModel, DigitalPortType } from '../models/actuator.model';
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
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import * as math from 'mathjs';
import { EventRepository } from '@process/infrastructure/repositories/event.repository';
import { ElementType } from '../models/event.model';
import { type InverterConfigParam, ModbusTaskService } from './modbus-task.service';
import { report } from 'process';
import { TriggerService } from './trigger.service';
import { ScheduleService } from './schedule.service';
import { TriggerModel } from '../models/trigger.model';

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
        private modBusService: ModbusTaskService,
        private actuatorService: ActuatorService,
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

    public async reset(process: ProcessModel, causes?: { id: string; type: ProcessType; cause: string }[]): Promise<void> {
        const index = this.processList.map(x => x.cycle._id).indexOf(process.cycle._id);
        this._clearQueuedSequences(process);
        // le statut peut etre reserve (IN_PROCCESS) avant que processList ne contienne l'entree
        // (voir la reservation synchrone de la regle 3) : sans ce fallback, un OFF arrivant dans
        // cette fenetre ne trouverait rien dans processList et ne ferait rien.
        if (index > -1 || process.cycle.status === ExecutableStatus.IN_PROCCESS) {
            this.processList[index]?.instance?.unsubscribe();
            const actuators = await this._resolveActuators();
            const modulesToStop = process.cycle.getModules(actuators)
                .filter((actuator) => !this._isActuatorStillInUse(actuator, process.cycle._id, actuators));
            await this.actuatorService.reset(modulesToStop);
            process.cycle.status = ExecutableStatus.STOPPED;
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
            //this.modBusService.execute("task-1234", { value: 300 });
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
        const actuator = this.configurationService.structure.actuators.find((a) => {
            if (a.type !== ActuatorType.COM) return false;
            const config = a.config as ComActuatorConfigModel;
            const action = config.actions?.[0];
            return config.deviceId === deviceId
                && action?.type === DigitalPortType.OUTPUT
                && action?.digitalPort === channel;
        });
        if (!actuator) return;

        const actuators = await this._resolveActuators();
        const moduleCycle = this.configurationService.structure.cycles.find((cycle) =>
            cycle.type === CycleType.MODULE && cycle.exists(actuator, actuators));
        if (!moduleCycle) return;

        const alreadyInRequestedState = isOn
            ? moduleCycle.status === ExecutableStatus.IN_PROCCESS
            : moduleCycle.status === ExecutableStatus.STOPPED;
        if (alreadyInRequestedState) return;

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
        const pro = this.eventRepository.save({
            elementId: data.id,
            date: new Date(),
            elementType: ElementType.CYCLE,
            additionalData: { type: process.mode, value: data.status, status: data.status }
        });
        //const process: { id: string; causes: { type: ProcessType; cause: string }[] } = { id: processModel.cycle.id, causes };
        return pro.then(() => {
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, true)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (local)'));
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, false)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (remote)'));
            return 'sent';
        }
            //test if connected ... to not hang nya

        );
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
            // await this.eventRepository.save({
            //     elementId: process.cycle._id,
            //     date: new Date(),
            //     elementType: ElementType.CYCLE,
            //     additionalData: { type: process.mode, value: process.action }
            // })
            if (process.cycle.type === CycleType.MODULE && process.mode !== ProcessMode.AUTO) {
                await this._cascadeStopConflictingCycles(process);
            }
            if (process.cycle.type === CycleType.CYCLE && process.mode !== ProcessMode.AUTO && process.action === ExecutableAction.OFF) {
                await this._cascadeStopOwningModules(process);
            }
            if (process.action === ExecutableAction.OFF) {
                let report: { id: string; type: ProcessType; cause: string }[];
                if (process.sourceCycleId) {
                    report = [];
                    report.push({ id: process.id, type: process.type, cause: 'stopped by parent : ' + this.configurationService.structure.cycles.find(x => x._id === process.sourceCycleId)?.name });
                } else {

                    if (process.mode === ProcessMode.TRIGGER && process.cycle.type === CycleType.MODULE && process.type === ProcessType.FORCE) {
                        report = [];
                        report.push({ id: process.id, type: process.type, cause: 'manual push button : ' + process.cycle.name });
                    }
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
        const report: { id: string; type: ProcessType; cause: string }[] = [];
        const conflictedProcesses: ProcessModel[] = await this._getConflictedExecutables(process);
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
        const confirmationType = report.find((x) => x.type === ProcessType.CONFIRMATION);
        if (confirmationType) {
            process.type = ProcessType.CONFIRMATION;
            this._needConfirmation(process, report);
        } else {
            this._manageProcessType(process);
        }
    }

    private _executeProcess(process: ProcessModel): void {

        process.instance = this._execute(process).subscribe(
            {
                next: async () => {
                    const report: { id: string; type: ProcessType; cause: string }[] = [];
                    report.push({ id: process.id, type: process.type, cause: 'end lifecycle normal stop : ' + process.cycle.name });
                    await this.reset(process, report);
                    // await this.eventRepository.save({
                    //     elementId: process.cycle._id,
                    //     date: new Date(),
                    //     elementType: ElementType.CYCLE,
                    //     additionalData: { type: process.mode, value: ExecutableAction.OFF }
                    // })
                },
                error: async (_err) => {
                    this.logger.error({ err: _err }, 'execution error');
                    const report: { id: string; type: ProcessType; cause: string }[] = [];
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
        childProcess.mode = ProcessMode.AUTO;
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
            const report: { id: string; type: ProcessType; cause: string }[] = [];
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
            if (module.name !== '23') {
                this.processList.forEach((proc) => { // and not in confirmation state
                    const isConflicting = process.type !== ProcessType.CONFIRMATION && proc.type !== ProcessType.CONFIRMATION
                        && proc.cycle.type !== CycleType.MODULE && proc.cycle.exists(module, actuators)
                        && !conflictedExecutable.find((x) => x.cycle._id === proc.cycle._id) && process.action !== 'OFF';
                    if (isConflicting) { //&& (proc.cycle.id !== process.cycle.id)
                        conflictedExecutable.push(proc);
                    }
                })
            }

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
            const report: { id: string; type: ProcessType; cause: string }[] = [];
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
            const report: { id: string; type: ProcessType; cause: string }[] = [];
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
            let report: { id: string; type: ProcessType; cause: string }[] = [];
            if (process.mode === ProcessMode.TRIGGER && process.cycle.type === CycleType.MODULE && process.type === ProcessType.FORCE) {
                report = [];
                report.push({ id: process.id, type: process.type, cause: 'manual push button : ' + process.cycle.name });
            }
            return from(this.reset(process, report));
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
        let obs: Observable<{ sequenceId: string; names: string[]; duration: number }> =
            ProcessService._ofNull<{ sequenceId: string; names: string[]; duration: number }>()
                .pipe(tap(async () => {
                    process.cycle.status = ExecutableStatus.IN_PROCCESS;
                    this.processList.push(process);
                    let report: { id: string; type: ProcessType; cause: string }[] = [];
                    if (process.mode === ProcessMode.TRIGGER && process.cycle.type === CycleType.MODULE && process.type === ProcessType.FORCE) {
                        report = [];
                        report.push({ id: process.id, type: process.type, cause: 'manual push button : ' + process.cycle.name });
                    }

                    await this._processProgress(process.cycle._id, ExecutableAction.ON, process.mode, report);
                }));

        executionLst.forEach((sequence, index) => {
            const chainObs = this._createExecObs(executionLst[index - 1], sequence, modules, timings, process.mode, sourceCycleId);
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
        previousSeq: { sequenceId: string; names: string[]; duration: number },
        currentSeq: { sequenceId: string; names: string[]; duration: number },
        modules: IActuatorModule[],
        timings: Map<string, ModuleTimingConfig>,
        mode: ProcessMode,
        sourceCycleId?: string
    ): Observable<{ sequenceId: string; names: string[]; duration: number }> {
        const ref = { sequenceId: currentSeq.sequenceId, flag: new Subject() };
        return of(previousSeq?.names || []).pipe(
            mergeMap((previousNames) => {
                return of(currentSeq.names).pipe(
                    map((currentNames) => {
                        const index = this.queuedSequences.findIndex(x => x.sequenceId === previousSeq?.sequenceId);
                        if (index >= 0) {
                            this.queuedSequences.splice(index, 1);
                        }
                        this.queuedSequences.push(ref);
                        this._checkSequenceCondition(ref.sequenceId).then((skipExecSequence) => {

                            if (skipExecSequence) {
                                setTimeout(() => {
                                    ref.flag.next(null);
                                }, 0);
                            } else {
                                this._switchProcess({ id: previousSeq?.sequenceId, names: previousNames, duration: previousSeq?.duration },
                                    { id: currentSeq.sequenceId, names: currentNames, duration: currentSeq.duration }, modules, timings, mode, sourceCycleId);
                                setTimeout(() => {
                                    ref.flag.next(null);
                                }, currentSeq.duration);
                            }

                        });
                        return currentSeq;
                    })
                );
            }),
            delayWhen(() => ref.flag)
        );
    }

    private async _checkSequenceCondition(sequenceId: string): Promise<boolean> {
        const sequence = this.configurationService.sequences.find(x => x._id === sequenceId);
        const parser = math.parser();

        const asyncEvery = async (arr: any[], predicate: { (condition: any): Promise<any>; (arg0: any): any; }) => {
            for (const e of arr) {
                if (!await predicate(e)) return false;
            }
            return true;
        };

        if (!sequence?.securityConfig?.conditions?.length) {
            return false;
        }

        return await asyncEvery(sequence.securityConfig.conditions, async (condition) => {
            const extractedVal = await this.valueRepository.getDeviceValue(condition.elementId);
            if (!extractedVal) { return false; }
            const value = condition.elementType === ElementType.SENSOR
                ? (extractedVal as SensorValueModel).value
                : (extractedVal as ProcessValueModel).status;
            if (value === undefined || value === null) { return false; }
            return parser.evaluate(`(${value} ${condition.operator} ${condition.value})`);
        });

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
    private async _processProgress(id: string, action: ExecutableAction, mode: ProcessMode | 'SYSTEM', causes?: { id: string; type: ProcessType; cause: string }[], duration?: number): Promise<string> {
        const seqFound = this.configurationService.sequences.find(seq => seq._id === id);
        const cycFound = this.configurationService.structure.cycles.find(cyc => cyc._id === id);
        if (!seqFound && !cycFound) {
            return;
        }
        const type: ExecutableType = cycFound ? ExecutableType.CYCLE : ExecutableType.SEQUENCE;
        const startedAt = new Date();
        //const endedAt = action === ExecutableAction.ON && duration ? startedAt.setMilliseconds(startedAt.getMilliseconds() + duration) : undefined;
        const status = action === ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        let data = { type, id, status, startedAt, duration };
        if (type === ExecutableType.SEQUENCE) {
            if (action === ExecutableAction.ON) {
                // this.modBusService.execute("task-1234", { value: 96});
                // this.modBusService.applyInverterConfig("inverter-001", [

                //      { "param": "F00.11", "value": 4200,persist:true }, 



                // ])
            }

            seqFound.status = status;
            seqFound.progression = status === ExecutableStatus.IN_PROCCESS ? { startedAt, duration } : null;
        } else {
            cycFound.status = status;
            let cycleDuration = 0;
            cycFound.sequences.forEach((x) => cycleDuration = cycleDuration + Number(x.securityConfig.maxDuration))
            cycFound.progression = status === ExecutableStatus.IN_PROCCESS ? { startedAt, duration: cycleDuration } : null;
            data = { type, id, status, startedAt, duration: cycleDuration };
        }

        const pro = this.eventRepository.save({
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
        });

        if (cycFound) {
            const st = this.configurationService.deviceListeners.find(x => x.deviceId === cycFound._id);
            if (st) {
                //st.subject.next(data); // pour ecouter les trigger
            }

        }

        return pro.then(() => {
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, true)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (local)'));
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, false)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (remote)'));
            return 'sent';
        });
    }
    public async applyInverterConfig(inverterId: string, params: InverterConfigParam[]): Promise<void> {
        return this.modBusService.applyInverterConfig(inverterId, params);
    }

    private percentToFrequencyRegister(taskId, percent) {
        const MAX_HZ = 50;
        const SCALE = 100; // 0.01 Hz

        // sécurité
        if (percent < 0) percent = 0;
        if (percent > 100) percent = 100;

        // calcul fréquence
        const frequencyHz = (percent / 100) * MAX_HZ;

        // valeur registre Modbus
        const registerValue = Math.round(frequencyHz * SCALE);
        this.modBusService.execute(taskId, { value: registerValue });

    }

    private _needConfirmation(processModel: ProcessModel, causes: { type: ProcessType; cause: string }[]): Promise<string> {
        const data = { type: ExecutableType.CYCLE, id: processModel.cycle._id, status: ExecutableStatus.WAITTING_CONFIRMATION, causes };
        const cycFound = this.configurationService.structure.cycles.find((cyc) => cyc._id === data.id);
        if (cycFound) {
            cycFound.status = ExecutableStatus.WAITTING_CONFIRMATION;
        }
        const pro = this.eventRepository.save({
            elementId: data.id,
            date: new Date(),
            elementType: ElementType.CYCLE,
            additionalData: { type: processModel.mode, value: data.status, status: data.status, causes: causes }
        });
        return pro.then(() => {
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, true)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (local)'));
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, false)
                .catch((err) => this.logger.warn({ err }, 'failed to send status sync message (remote)'));
            return 'sent';
        });
    }

    private static _ofNull<T>(): Observable<T> {
        return of(null as T);
    }

    private _getConflictedSchedules(): ScheduleModel[] {
        const jobs = this.schedulerRegistry.getCronJobs();
        jobs.forEach((value, id) => {
            let next;
            try {
                next = value.nextDate().toJSDate();
            } catch (e) {
                // les job  deja execute ou qui ne seront plus execute sont là
                next = 'error: next fire date is in the past!';
            }
            //this.logger.log(`job: ${id} -> next: ${next}`);
        });
        return [];
    }

}

