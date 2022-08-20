/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { delay, from, map, mergeMap, Observable, of, tap } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ProcessInvalidTypeError } from '../errors/process-invalid-type-error';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ExecutableAction,
    ExecutableStatus,
    ExecutableType,
    ProcessType
} from '../interfaces/executable.interface';
import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { ProcessModel } from '../models/process.model';
import { ScheduleModel } from '../models/schedule.model';
import { ConfigurationService } from './configuration.service';
import { ScheduleService } from './schedule.service';

@Injectable()
export class ProcessService {
    public processQueue: ProcessModel[] = [];
    public constructor(
        private configurationService: ConfigurationService,
        private wsService: SocketIoClientProxyService,
        private scheduleService: ScheduleService,
        private configurationRepository: ConfigurationRepository
    ) { }

    public async execute(process: ProcessModel): Promise<void> {
        this._initializeProcess(process);
        return this._manageProcessType(process);
    }

    public async reset(process: ProcessModel): Promise<void> {
        const index = this.processQueue.map(x => x.cycle.id).indexOf(process.cycle.id);
        if (index > -1) {
            this.processQueue[index].instance?.unsubscribe();
            await process.cycle.reset();
            this.processQueue.splice(index, 1);
            await this._processProgress(process.cycle.id, ExecutableAction.OFF).then(() => true);
        }

    }

    public async resetAllModules(): Promise<void> {
        const processes = this.configurationService.getAllCyles();
        for (const key in processes) {
            if (Object.prototype.hasOwnProperty.call(processes, key)) {
                const process = processes[key];
                await this._initialReset(process);
            }
        }
    }

    public async tesAllModules(): Promise<void> {
        const processes = this.configurationService.getAllCyles();
        for (const key in processes) {
            if (Object.prototype.hasOwnProperty.call(processes, key)) {
                const process = processes[key];
                process.action = ExecutableAction.ON;
                await this.execute(process);
            }
        }
    }

    public initSchedule(process: ProcessModel): void {
        const scheduleModel = new ScheduleModel();
        const schedule = process.schedule;
        scheduleModel.id = schedule.id;
        scheduleModel.name = schedule.name;
        scheduleModel.description = schedule.description;
        scheduleModel.methode = async (): Promise<void> => {
            this.execute(process);
        };
        scheduleModel.cron = schedule.cron;
        this.scheduleService.createSchedule(scheduleModel);
    }

    private _removeIgnoredProcess(process: ProcessModel): void {
        const index = this.processQueue.map(x => x.id).indexOf(process.id);
        if (index > -1) {
            this.processQueue.splice(index, 1);
        }
    }

    private async _initialReset(process: ProcessModel): Promise<void> {
        await process.cycle.reset();
        await this._processProgress(process.cycle.id, ExecutableAction.OFF);
    }

    private _initializeProcess(process: ProcessModel): void {
        const struct = this.configurationService.structure;
        process.cycle = struct.cycles.find(x => x.id === process.cycle.id);
        if (!process.cycle) {
            throw new StructureInvalidError();
        }
    }

    private async _manageProcessType(process: ProcessModel): Promise<void> {
        if (process.type === ProcessType.FORCE) {
            await this._resetConflictedProcesses(process);
            this._executeProcess(process);
        } else if (process.type === ProcessType.QUEUED) {
            throw new Error('Method not implemented.');
        } else if (process.type === ProcessType.IGNORE) {
            this._removeIgnoredProcess(process);
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
        for (const proc of conflictedProcesses) {
            if (cyclePriority.priority < proc.cycle.modePriority.find((x) => x.mode === proc.mode).priority) {
                process.type = ProcessType.FORCE;
                report.push({ id: proc.id, type: process.type, cause: 'conflicted with cycle : ' + proc.cycle.name });
            } else {
                process.type = ProcessType.CONFIRMATION;
                this.processQueue.push(process);
                report.push({ id: proc.id, type: process.type, cause: 'conflicted with cycle : ' + proc.cycle.name });
                break;
            }
        }
        const confirmationType = report.find((x) => x.type === ProcessType.CONFIRMATION);
        if (confirmationType) {
            process.type = ProcessType.CONFIRMATION;
            await this._needConfirmation(process, report);
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
    }

    private async _getConflictedExecutables(process: ProcessModel): Promise<ProcessModel[]> {
        const conflictedExecutable: ProcessModel[] = [];
        const modules = process.cycle.getModules();
        modules.forEach((module) => {
            this.processQueue.forEach((proc) => {
                if (proc.cycle.exists(module) && !conflictedExecutable.find((x) => x.cycle.id === proc.cycle.id)) {
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
                    this.processQueue.push(process);
                    await this._processProgress(process.cycle.id, ExecutableAction.ON);

                }));

        executionLst.forEach((sequence, index) => {
            const chainObs = this._createExecObs(executionLst[index - 1], sequence, modules);
            obs = obs.pipe(mergeMap(() => chainObs));
        });

        return obs.pipe(
            mergeMap((lastPins) => {
                lastPins.portNums.forEach((previousPin) => {
                    modules.find(x => x.portNum === previousPin).execute(0);
                });
                return from(this._processProgress(lastPins.sequenceId, ExecutableAction.OFF)).pipe(mergeMap(() => of(null)));
            })
        );
    }

    private _createExecObs(
        previousSeq: { sequenceId: string; portNums: number[]; duration: number },
        currentSec: { sequenceId: string; portNums: number[]; duration: number },
        modules: ModuleModel[]
    ): Observable<{ sequenceId: string; portNums: number[]; duration: number }> {
        return of(previousSeq?.portNums || []).pipe(
            mergeMap((previousPins) => {
                return of(currentSec.portNums).pipe(
                    map((currentPins) => {
                        this._switchProcess({ id: previousSeq?.sequenceId, pins: previousPins, duration: previousSeq?.duration },
                            { id: currentSec.sequenceId, pins: currentPins, duration: currentSec.duration }, modules);
                        return currentSec;
                    })
                );
            }),
            delay(currentSec.duration)
        );
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
        const dataToSave = JSON.stringify(data);
        // eslint-disable-next-line max-len

        const pro = action === ExecutableAction.ON ? this.configurationRepository.insertProcessStatus(dataToSave) : this.configurationRepository.deleteProcessStatus(data.id);
       return pro.then(() =>
            this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) })
        );
    }

    private _needConfirmation(processModel: ProcessModel, causes: { type: ProcessType; cause: string }[]): Promise<string> {
        const process: { id: string; causes: { type: ProcessType; cause: string }[] } = { id: processModel.id, causes };
        return this.wsService.sendMessage({ pattern: 'agg/execution/confirmation', data: JSON.stringify(process) });
    }

    private static _ofNull<T>(): Observable<T> {
        return of(null as T);
    }

}
