import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { delay, from, map, mergeMap, Observable, of, tap } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ExecutableAction,
    ExecutableMode,
    ExecutableStatus,
    IExecutable
} from '../interfaces/executable.interface';
import { ModuleModel } from '../models/module.model';
import { ProcessModel } from '../models/process.model';
import { StructureModel } from '../models/structure.model';
import { ConfigurationService } from './configuration.service';

@Injectable()
export class ProcessService {
    public execQueue: ProcessModel[] = [];
    public constructor(private configurationService: ConfigurationService,
        private wsService: SocketIoClientProxyService) { }

    // eslint-disable-next-line max-lines-per-function
    public async execute(execution: ProcessModel): Promise<boolean> {
        await this.configurationService.getConfiguration();
        execution = this._initializeTask(execution);
        if (!execution.task) {
            throw new StructureInvalidError();
        }
        if (execution.mode === ExecutableMode.FORCE) {
            await this._resetConflictedProcesses(execution);
        } else if (execution.mode === ExecutableMode.QUEUED) {
            throw new Error('Method not implemented.');
        }

        execution.instance = this._execute(execution).subscribe(
            {
                next: (x) => { console.log('got value ' + x); },
                error: async (err) => {
                    console.error('something wrong occurred: ' + err);
                    await this._reset(execution);
                },
                complete: () => {
                    const index = this.execQueue.map(x => x.task.id).indexOf(execution.task.id);
                    this.execQueue.splice(index, 1);
                }
            }
        );

        this.execQueue.push(execution);

        return true;
    }

    private async _resetConflictedProcesses(execution): Promise<boolean> {
        const conflictedExecutables: IExecutable[] =
            await this._getConflictedExecutables(execution);
        conflictedExecutables.forEach(async (executable) => {
            const index = this.execQueue.map(x => x.task.id).indexOf(executable.id);
            this.execQueue[index].instance.unsubscribe();
            this.execQueue.splice(index, 1);
            await executable.reset();
        });

        return true;
    }

    private async _getConflictedExecutables(execution: ProcessModel): Promise<IExecutable[]> {
        const modules = execution.task.getModules();
        const conflictedExecutable: IExecutable[] = [];
        const tasksInProccess = this.execQueue.map(x => x.task);
        modules.forEach((module) => {
            tasksInProccess.forEach((task) => {
                if (task.exists(module) && !conflictedExecutable.find((x) => x.id === task.id)) {
                    conflictedExecutable.push(task);
                }
            })
        });

        return conflictedExecutable;
    }

    private _initializeTask(execution: ProcessModel): ProcessModel {
        const struct = this.configurationService.structure;
        const taskId = execution.task.id;

        const found = struct.cycles.find(x => x.id === taskId);
        execution.task = found;
        return execution;
    }

    ///////// rework
    // eslint-disable-next-line max-lines-per-function
    private _execute(process: ProcessModel): Observable<boolean> {
        if (process.action === ExecutableAction.OFF) {
            return from(process.task.reset())
                .pipe(map((data) => {
                    process.task.status = ExecutableStatus.STOPPED;
                    return data;
                }));
        }
        const modules = process.task.getModules();
        const executionLst = process.task.getExecutionStructure(process.duration);
        let obs: Observable<{ sequenceId: string; portNums: number[]; duration: number }> =
            ProcessService._ofNull<{ sequenceId: string; portNums: number[]; duration: number }>()
                .pipe(tap(() => { process.task.status = ExecutableStatus.IN_PROCCESS }));
        executionLst.forEach((sequence, index) => {
            const o = this._createExecObs(executionLst[index - 1], sequence, modules);
            obs = obs.pipe(mergeMap(() => o));
        });

        return obs.pipe(map((lastPins) => {
            lastPins.portNums.forEach((previousPin) => {
                modules.find(x => x.portNum === previousPin).execute(0);
                process.task.status = ExecutableStatus.STOPPED;
            });
            this._processProgress(lastPins.sequenceId, ExecutableAction.OFF, lastPins.duration);
            return true;
        }));
    }

    private _reset(process: ProcessModel): Promise<boolean> {
        return process.task.reset();
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

    private _switchProcess(previousData: { id: string, pins: number[], duration: number },
        currentData: { id: string, pins: number[], duration: number }, modules: ModuleModel[]): boolean {

        previousData.pins.forEach((previousPin) => {
            modules.find(x => x.portNum === previousPin).execute(0);
        });
        this._processProgress(previousData.id, ExecutableAction.OFF);

        currentData.pins.forEach((currentPin) => {
            modules.find(x => x.portNum === currentPin).execute(1);
        });
        this._processProgress(currentData.id, ExecutableAction.ON, currentData.duration);

        return true;
    }

    private _processProgress(sequenceId: string, action: ExecutableAction, duration?: number): Promise<string> {
        const endsAt = action === ExecutableAction.ON ? (new Date()).setMilliseconds(duration) : undefined;
        const data = {
            sequenceId,
            status: action === ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED,
            endsAt
        }
        return this.wsService.sendMessage({ pattern: 'UPDATE_STATUS', data: JSON.stringify(data) })
        // .then(data => { console.log(data); })
        // .catch(err => { console.log(err); });

    }

    private static _ofNull<T>(): Observable<T> {
        return of(null as T);
    }

    public async resetAllModules(): Promise<boolean> {
        await this.configurationService.getConfiguration();
        const modules = this.configurationService.structure.getModules();
        modules.forEach(module => {
            module.execute(0);
        });
        return true;
    }

    public getConfiguration(): Promise<StructureModel> {
        return this.configurationService.getConfiguration();
    }
}
