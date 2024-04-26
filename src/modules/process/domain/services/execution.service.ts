/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { Injectable, Logger } from '@nestjs/common';
import { StructureRepository } from '@process/infrastructure/repositories/structure.repository';
import { delayWhen, from, map, mergeMap, Observable, of, Subject, Subscription, takeLast, takeUntil, tap, timer } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ProcessInvalidTypeError } from '../errors/process-invalid-type-error';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ExecutableAction,
    ExecutableStatus,
    ProcessMode,
    ProcessType
} from '../interfaces/executable.interface';
import { ModuleModel } from '../models/module.model';
import { ProcessModel } from '../models/process.model';
import { StructureService } from './configuration.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleModel } from '../models/schedule.model';
import { CycleModel } from '../models/cycle.model';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleEntity } from '@process/infrastructure/entities/cycle.entity';
import { ExecutableType } from '../models/value.model';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { ProcessValueEntity } from '@process/infrastructure/entities/process-value.entity';
import { ProcessValueRepository } from '@process/infrastructure/repositories/process-value.repository';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import * as math from 'mathjs';

@Injectable()
export class ProcessService {
    public processList: ProcessModel[] = [];
    public queuedSequences = [];
    public constructor(
        private schedulerRegistry: SchedulerRegistry,
        private configurationService: StructureService,
        private wsService: SocketIoClientProxyService,
        private configurationRepository: StructureRepository,
        private processValueRepository: ProcessValueRepository,
        private cycleRepository: CycleRepository,
        private valueRepository: ValueRepository
    ) {

    }

    public async execute(process: ProcessModel): Promise<void> {
        this._initializeProcess(process);
        return await this._manageProcessType(process);
    }

    public async reset(process: ProcessModel): Promise<void> {
        const index = this.processList.map(x => x.cycle.id).indexOf(process.cycle.id);
        this._clearQueuedSequences(process);
        if (index > -1) {
            this.processList[index].instance?.unsubscribe();
            await process.cycle.reset();
            this.processList.splice(index, 1);
            for (const sequence of process.cycle.sequences) {
                const state = await this.valueRepository.getValues('SEQUENCE', sequence.id)[0] as ProcessValueEntity;
                if (state?.status !== ExecutableStatus.STOPPED) {
                    await this._processProgress(sequence.id, ExecutableAction.OFF).then(() => true);
                }
            }

            await this._processProgress(process.cycle.id, ExecutableAction.OFF).then(() => true);
        }

    }

    public async resetAllModules(): Promise<void> {
        const cycles = await this.cycleRepository.get();
        for (const key in cycles) {
            if (Object.prototype.hasOwnProperty.call(cycles, key)) {
                const cycleModel = CycleEntity.mapToModel(cycles[key]);
                await this._initialReset(cycleModel);
            }
        }
    }

    public async testAllModules(): Promise<void> {
        const cycles = await this.cycleRepository.get();
        for (const key in cycles) {
            if (Object.prototype.hasOwnProperty.call(cycles, key)) {
                const cycleModel = CycleEntity.mapToModel(cycles[key]);
                const process = new ProcessModel();
                process.cycle = cycleModel;
                process.action = ExecutableAction.ON;
                process.type = ProcessType.FORCE;
                process.mode = ProcessMode.MANUAL;
                await this.execute(process);
            }
        }
    }

    private _clearQueuedSequences(process: ProcessModel): void {
        process.cycle.sequences.forEach(sequence => {
            const index = this.queuedSequences.findIndex(x => x.sequenceId === sequence.id);
            if (index >= 0) {
                this.queuedSequences.splice(index, 1);
            }
        });
    }

    private _removeIgnoredProcess(process: ProcessModel): Promise<string> {
        const index = this.processList.findIndex(x => x.cycle.id === process.cycle.id);
        if (index > -1) {
            this.processList.splice(index, 1);
        }

        const data = { type: ExecutableType.CYCLE, id: process.cycle.id, status: ExecutableStatus.STOPPED };
        const pro = this.processValueRepository.save(data);
        //const process: { id: string; causes: { type: ProcessType; cause: string }[] } = { id: processModel.cycle.id, causes };
        return pro.then(() =>
            //test if connected ... to not hang nya
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) })
        );
    }

    private async _initialReset(cycleModel: CycleModel): Promise<void> {
        await cycleModel.reset();

        for (const sequence of cycleModel.sequences) {
            await this._processProgress(sequence.id, ExecutableAction.OFF).then(() => true);
        }

        await this._processProgress(cycleModel.id, ExecutableAction.OFF);
    }

    private _initializeProcess(process: ProcessModel): void {
        const struct = this.configurationService.structure;
        const currentCycle = struct.cycles.find(x => x.id === process.cycle.id);
        if (!currentCycle && process.type === ProcessType.SKIP) {
            //skip concerne les sequences ... donc pas de cycle existant
            process.id = process.cycle.id;
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
            await this._resetConflictedProcesses(process);
            this._executeProcess(process);
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
                process.type = ProcessType.FORCE;
                report.push({ id: proc.id, type: process.type, cause: 'conflicted with cycle : ' + proc.cycle.name });
            } else {
                const processAlreadyExist = this.processList.find(x => x.cycle.id === process.cycle.id);
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
                    await this.reset(process);
                },
                error: async (_err) => {
                    Logger.debug(_err, 'execution');
                    await this.reset(process);
                }
            }
        );
    }

    private async _resetConflictedProcesses(process: ProcessModel): Promise<void> {
        const conflictedProcesses: ProcessModel[] = await this._getConflictedExecutables(process);
        for (const proc of conflictedProcesses) {
            await this.reset(proc);
        }
        if (process.type === ProcessType.FORCE) {
            const foundIndex = this.processList.findIndex(x => x.cycle.id === process.cycle.id && x.type === ProcessType.CONFIRMATION);
            if (foundIndex > -1) {
                this.processList.splice(foundIndex, 1);
            }
        }
    }

    private async _getConflictedExecutables(process: ProcessModel): Promise<ProcessModel[]> {
        const conflictedExecutable: ProcessModel[] = [];
        const modules = process.cycle.getModules();
        modules.forEach((module) => {
            this.processList.forEach((proc) => { // and not in confirmation state
                if ((process.type !== ProcessType.CONFIRMATION) && proc.type !== ProcessType.CONFIRMATION && proc.cycle.exists(module) && !conflictedExecutable.find((x) => x.cycle.id === proc.cycle.id) && proc.cycle.id !== process.cycle.id) {
                    conflictedExecutable.push(proc);
                }
            })
        });

        return conflictedExecutable;
    }

    // eslint-disable-next-line max-lines-per-function
    private _execute(process: ProcessModel): Observable<void> {
        if (process.action === ExecutableAction.OFF) {
            return from(this.reset(process));
        }
        const modules = process.cycle.getModules();
        const executionLst = process.cycle.getExecutionStructure(process.duration);

        let obs: Observable<{ sequenceId: string; portNums: number[]; duration: number }> =
            ProcessService._ofNull<{ sequenceId: string; portNums: number[]; duration: number }>()
                .pipe(tap(async () => {
                    process.cycle.status = ExecutableStatus.IN_PROCCESS;
                    this.processList.push(process);
                    await this._processProgress(process.cycle.id, ExecutableAction.ON);
                }));

        executionLst.forEach((sequence, index) => {
            const chainObs = this._createExecObs(executionLst[index - 1], sequence, modules);
            obs = obs.pipe(mergeMap(() => chainObs));
        });

        return obs.pipe(
            mergeMap((previousSeq) => {
                previousSeq.portNums.forEach((previousPin) => {
                    modules.find(x => x.portNum === previousPin).execute(0);
                });
                const index = this.queuedSequences.findIndex(x => x.sequenceId === previousSeq?.sequenceId);
                if (index >= 0) {
                    this.queuedSequences.splice(index, 1);
                }
                return from(this._processProgress(previousSeq.sequenceId, ExecutableAction.OFF)).pipe(mergeMap(() => of(null)));
            })
        );
    }

    private _createExecObs(
        previousSeq: { sequenceId: string; portNums: number[]; duration: number },
        currentSeq: { sequenceId: string; portNums: number[]; duration: number },
        modules: ModuleModel[]
    ): Observable<{ sequenceId: string; portNums: number[]; duration: number }> {
        const ref = { sequenceId: currentSeq.sequenceId, flag: new Subject() };
        return of(previousSeq?.portNums || []).pipe(
            mergeMap((previousPins) => {
                return of(currentSeq.portNums).pipe(
                    map((currentPins) => {
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
                                this._switchProcess({ id: previousSeq?.sequenceId, pins: previousPins, duration: previousSeq?.duration },
                                    { id: currentSeq.sequenceId, pins: currentPins, duration: currentSeq.duration }, modules);
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
        const sequence = this.configurationService.sequences.find(x => x.id === sequenceId);
        const parser = math.parser();

        const asyncEvery = async (arr: any[], predicate: { (condition: any): Promise<any>; (arg0: any): any; }) => {
            for (const e of arr) {
                if (!await predicate(e)) return false;
            }
            return true;
        };

        if (!sequence.conditions?.length) {
            return false;
        }

        return await asyncEvery(sequence.conditions, async (condition) => {
            const extractedVal = await this.valueRepository.getDeviceValue(condition.deviceId);
            const value = (extractedVal as SensorValueModel).value || (extractedVal as ProcessValueModel).status;
            if (!value) { return false; }
            return parser.evaluate(`(${value} ${condition.operator} ${condition.value})`);
        });

    }

    private async _switchProcess(previousData: { id: string; pins: number[]; duration: number },
        currentData: { id: string; pins: number[]; duration: number }, modules: ModuleModel[]): Promise<boolean> {

        if (previousData.id) {
            this._switchModule(previousData.pins, modules, 0);
            await this._processProgress(previousData.id, ExecutableAction.OFF).then(() => true);
        }

        this._switchModule(currentData.pins, modules, 1);
        return this._processProgress(currentData.id, ExecutableAction.ON, currentData.duration).then(() => true);
    }

    private _switchModule(dataPins: number[], modules: ModuleModel[], action: number): void {
        dataPins.forEach((dataPin) => {
            try {
                modules.find(x => x.portNum === dataPin).execute(action);
            } catch (error) {
                Logger.warn(error, 'execution module pornum: ' + dataPin);
            }
        });
    }

    // eslint-disable-next-line complexity
    private async _processProgress(id: string, action: ExecutableAction, duration?: number): Promise<string> {
        const seqFound = this.configurationService.sequences.find(seq => seq.id === id);
        const cycFound = this.configurationService.structure.cycles.find(cyc => cyc.id === id);
        if (!seqFound && !cycFound) {
            return;
        }
        const type: ExecutableType = cycFound ? ExecutableType.CYCLE : ExecutableType.SEQUENCE;
        const startedAt = new Date();
        //const endedAt = action === ExecutableAction.ON && duration ? startedAt.setMilliseconds(startedAt.getMilliseconds() + duration) : undefined;
        const status = action === ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        let data = { type, id, status, startedAt, duration };
        if (type === ExecutableType.SEQUENCE) {
            seqFound.status = status;
            seqFound.progression = status === ExecutableStatus.IN_PROCCESS ? { startedAt, duration } : null;
        } else {
            cycFound.status = status;
            let cycleDuration = 0;
            cycFound.sequences.forEach((x) => cycleDuration = cycleDuration + Number(x.maxDuration))
            cycFound.progression = status === ExecutableStatus.IN_PROCCESS ? { startedAt, duration: cycleDuration } : null;
            data = { type, id, status, startedAt, duration: cycleDuration };
        }

        const pro = this.processValueRepository.save(data);

        if (cycFound) {
            const st = this.configurationService.deviceListeners.find(x => x.deviceId === cycFound.id);
            if (st) {
                //st.subject.next(data); // pour ecouter les trigger
            }

        }

        return pro.then(() =>
            //test if connected ... to not hang nya
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) })
        );
    }

    private _needConfirmation(processModel: ProcessModel, causes: { type: ProcessType; cause: string }[]): Promise<string> {
        const data = { type: ExecutableType.CYCLE, id: processModel.cycle.id, status: ExecutableStatus.WAITTING_CONFIRMATION, causes };
        const pro = this.processValueRepository.save(data);
        //const process: { id: string; causes: { type: ProcessType; cause: string }[] } = { id: processModel.cycle.id, causes };
        return pro.then(() =>
            //test if connected ... to not hang nya
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) })
        );
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

