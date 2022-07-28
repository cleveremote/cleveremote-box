import { Injectable, Logger, Next } from '@nestjs/common';
import Module from 'module';
import { delay, from, map, mergeMap, Observable, of, tap } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ConditionType,
    ExecutableAction,
    ExecutableMode,
    ExecutableStatus,
    ExecutableType
} from '../interfaces/executable.interface';
import { ModuleModel } from '../models/module.model';
import { ProcessModel } from '../models/process.model';
import { ConfigurationService } from './configuration.service';

@Injectable()
export class ProcessService {
    public processQueue: ProcessModel[] = [];
    public constructor(private configurationService: ConfigurationService,
        private wsService: SocketIoClientProxyService) { }

    public async execute(process: ProcessModel): Promise<boolean> {
        this._initializeProcess(process);
        await this._manageProcessMode(process);
        this._executeProcess(process);
        return true;
    }

    public async reset(process: ProcessModel): Promise<boolean> {
        const index = this.processQueue.map(x => x.cycle.id).indexOf(process.cycle.id);
        this.processQueue[index].instance.unsubscribe();
        await process.cycle.reset();
        this.processQueue.splice(index, 1);
        return this._processProgress(process.cycle.id, ExecutableAction.OFF).then(() => true);
    }

    public async initialReset(process: ProcessModel): Promise<void> {
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
        } else if (process.mode === ExecutableMode.QUEUED) {
            throw new Error('Method not implemented.');
        }
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
        this.processQueue.push(process);
    }

    private async _resetConflictedProcesses(process: ProcessModel): Promise<void> {
        const conflictedProcesses: ProcessModel[] = await this._getConflictedExecutables(process);
        conflictedProcesses.forEach(async (proc) => {
            await this.reset(proc);
        });
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
    private _execute(process: ProcessModel): Observable<boolean> {
        if (process.action === ExecutableAction.OFF) {
            return from(this.reset(process));
        }
        const modules = process.cycle.getModules();
        const executionLst = process.cycle.getExecutionStructure(process.duration);

        let obs: Observable<{ sequenceId: string; portNums: number[]; duration: number }> =
            ProcessService._ofNull<{ sequenceId: string; portNums: number[]; duration: number }>()
                .pipe(tap(() => { process.cycle.status = ExecutableStatus.IN_PROCCESS }));

        executionLst.forEach((sequence, index) => {
            const chainObs = this._createExecObs(executionLst[index - 1], sequence, modules);
            obs = obs.pipe(mergeMap(() => chainObs));
        });

        return obs.pipe(
            mergeMap((lastPins) => {
                lastPins.portNums.forEach((previousPin) => {
                    modules.find(x => x.portNum === previousPin).execute(0);
                });
                return from(this._processProgress(lastPins.sequenceId, ExecutableAction.OFF));
            }),
            map(() => true)
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

    private async _switchProcess(previousData: { id: string, pins: number[], duration: number },
        currentData: { id: string, pins: number[], duration: number }, modules: ModuleModel[]): Promise<boolean> {

        if (previousData.id) {
            this._switchModule(previousData.pins, modules, 0);
            this._processProgress(previousData.id, ExecutableAction.OFF).then(() => true);
        }

        this._switchModule(currentData.pins, modules, 1);
        this._processProgress(currentData.id, ExecutableAction.ON, currentData.duration).then(() => true);

        return true;
    }

    private _switchModule(dataPins: number[], modules: ModuleModel[], action: number) {
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
        if (((seqFound && cycFound) || (!seqFound && !cycFound))) {
            throw new StructureInvalidError();
        }
        const type: ExecutableType = cycFound ? ExecutableType.CYCLE : ExecutableType.SEQUENCE;
        const dateNow = new Date();
        const endedAt = action === ExecutableAction.ON ? dateNow.setMilliseconds(duration) : undefined;
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

    public async resetAllModules(): Promise<boolean> {
        const processes = this.configurationService.getAllCyles();
        processes.forEach(async process => {
            await this.initialReset(process);
        });
        return true;
    }

}
