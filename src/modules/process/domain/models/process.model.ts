import { delay, from, map, mergeMap, Observable, of, Subscription, tap } from 'rxjs';
import {
    ExecutableAction,
    ExecutableMode,
    ConditionType,
    IExecutable,
    ExecutableStatus
} from '../interfaces/executable.interface';

export class ProcessModel {
    public task: IExecutable;
    public action: ExecutableAction;
    public type: ConditionType;
    public function: string;
    public mode: ExecutableMode;
    public instance: Subscription;

    // eslint-disable-next-line max-lines-per-function
    public execute(): Observable<boolean> {
        if (this.action === ExecutableAction.OFF) {
            return from(this.task.reset())
                .pipe(map((data) => {
                    this.task.status = ExecutableStatus.STOPPED;
                    return data;
                }));
        }

        const executionLst = this.task.getExecutionStructure();
        let obs: Observable<{ portNums: number[]; duration: number }> =
            ProcessModel._ofNull<{ portNums: number[]; duration: number }>()
                .pipe(tap(() => { this.task.status = ExecutableStatus.IN_PROCCESS }));

        executionLst.forEach((sequence, index) => {
            const o = this._createExecObs(executionLst[index - 1], sequence);
            obs = obs.pipe(mergeMap(() => o));
        });

        return obs.pipe(map((lastPins) => {
            const modules = this.task.getModules();
            lastPins.portNums.forEach((previousPin) => {
                modules.find(x => x.portNum === previousPin).execute(0);
                this.task.status = ExecutableStatus.STOPPED;
            });
            return true;
        }));
    }

    public reset(): Promise<boolean> {
        return this.task.reset();
    }

    private _createExecObs(
        previousSeq: { portNums: number[]; duration: number },
        currentSec: { portNums: number[]; duration: number }
    ): Observable<{ portNums: number[]; duration: number }> {
        return of(previousSeq?.portNums || []).pipe(
            mergeMap((previousPins) => {
                return of(currentSec.portNums).pipe(
                    map((currentPins) => {
                        this._switchProcess(previousPins, currentPins);
                        return currentSec;
                    })
                );
            }),
            delay(currentSec.duration)
        );
    }

    private _switchProcess(previousPins: number[], currentPins: number[]): boolean {
        const modules = this.task.getModules();

        console.log('directions', modules.map(x => x.direction));
        previousPins.forEach((previousPin) => {
            modules.find(x => x.portNum === previousPin).execute(0);
        });
        currentPins.forEach((currentPin) => {
            modules.find(x => x.portNum === currentPin).execute(1);
        });
        return true;
    }

    private static _ofNull<T>(): Observable<T> {
        return of(null as T);
    }
}
