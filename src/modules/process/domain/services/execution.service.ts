import { Injectable, Logger } from '@nestjs/common';
import { delay, from, map, mergeMap, Observable, of, tap } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ExecutableAction,
    ExecutableMode,
    ExecutableStatus,
    ExecutableType
} from '../interfaces/executable.interface';
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
        private scheduleService: ScheduleService
    ) { }

    public async execute(process: ProcessModel): Promise<void> {
        this._initializeProcess(process);
        return this._manageProcessMode(process);
    }

    public async reset(process: ProcessModel): Promise<void> {
        const index = this.processQueue.map(x => x.cycle.id).indexOf(process.cycle.id);
        if (index > -1) {
            this.processQueue[index].instance.unsubscribe();
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

    private async _manageProcessMode(process: ProcessModel): Promise<void> {
        if (process.mode === ExecutableMode.FORCE) {
            await this._resetConflictedProcesses(process);
            this._executeProcess(process);
        }
        if (process.mode === ExecutableMode.QUEUED) {
            throw new Error('Method not implemented.');
        }
        if (process.mode === ExecutableMode.SCHEDULED) {
            this._manageSchedule(process);
        }

    }

    private _manageSchedule(process: ProcessModel): void {
        const scheduleModel = new ScheduleModel();
        const schedule = process.schedule;
        scheduleModel.id = schedule.id;
        scheduleModel.name = schedule.name;
        scheduleModel.description = schedule.description;
        scheduleModel.methode = (): void => {
            this._executeProcess(process);
        };
        scheduleModel.cron = schedule.cron;
        this.scheduleService.createSchedule(scheduleModel);
    }

    private _executeProcess(process: ProcessModel): void {

        process.instance = this._execute(process).subscribe(
            {
                next: async () => {
                    await this._processProgress(process.cycle.id, ExecutableAction.OFF);
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
            this._processProgress(previousData.id, ExecutableAction.OFF).then(() => true);
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
    private _processProgress(id: string, action: ExecutableAction, duration?: number): Promise<string> {
        const seqFound = this.configurationService.sequences.find(seq => seq.id === id);
        const cycFound = this.configurationService.structure.cycles.find(cyc => cyc.id === id);
        const type: ExecutableType = cycFound ? ExecutableType.CYCLE : ExecutableType.SEQUENCE;
        const dateNow = new Date();
        const endedAt = action === ExecutableAction.ON && duration ? dateNow.setMilliseconds(dateNow.getMilliseconds() + duration) : undefined;
        const status = action === ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        const data = { type, id, status, endedAt };
        if (type === ExecutableType.SEQUENCE) {
            seqFound.status = status;
            seqFound.progression = status === ExecutableStatus.IN_PROCCESS ? { startedAt: dateNow, duration } : null;
            // save in file .
        } else {
            cycFound.status = status;
            // save in file .
        }

        return this.wsService.sendMessage({ pattern: 'UPDATE_STATUS', data: JSON.stringify(data) });
    }

    private static _ofNull<T>(): Observable<T> {
        return of(null as T);
    }

}
