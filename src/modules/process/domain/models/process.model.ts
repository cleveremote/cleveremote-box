import { delay, from, lastValueFrom, map, mergeMap, Observable, of, Subscription, tap } from 'rxjs';
import {
    ExecutableAction,
    ExecutableMode,
    ConditionType,
    IExecutable,
    ExecutableStatus
} from '../interfaces/executable.interface';
import { ModuleStatus } from '../interfaces/structure.interface';

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
            ProcessModel.ofNull<{ portNums: number[]; duration: number }>()
                .pipe(tap((x) => { this.task.status = ExecutableStatus.IN_PROCCESS }
                ));

        executionLst.forEach((sequence, index) => {
            const o = this.createExecObs(executionLst[index - 1], sequence);
            obs = obs.pipe(mergeMap(() => o));
        });

        const obsChaining = obs.pipe(map((lastPins) => {
            const modules = this.task.getModules();
            lastPins.portNums.forEach((previousPin) => {
                modules.find(x => x.portNum === previousPin).execute(0);
                this.task.status = ExecutableStatus.STOPPED;
            });
            return true;
        }));

        return obsChaining;
    }

    private createExecObs(
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
        const processedPreviousPins: number[] = [];
        previousPins.forEach((previousPin) => {
            // const currentModule = modules.find((x) => x.portNum === currentPin);
            // if (previousPins.includes(currentPin)) {
            //     if (currentModule.status !== ModuleStatus.ON) {
            //         currentModule.execute(1);
            //         processedPreviousPins.push(currentPin);
            //     }
            // } else {
            //     currentModule.execute(1);
            // }
            modules.find(x => x.portNum === previousPin).execute(0);
        });
        currentPins.forEach((currentPin) => {
            // const currentModule = modules.find((x) => x.portNum === currentPin);
            // if (previousPins.includes(currentPin)) {
            //     if (currentModule.status !== ModuleStatus.ON) {
            //         currentModule.execute(1);
            //         processedPreviousPins.push(currentPin);
            //     }
            // } else {
            //     currentModule.execute(1);
            // }
            modules.find(x => x.portNum === currentPin).execute(1);
        });
        // previousPins = previousPins.filter((x) => !processedPreviousPins.includes(x));
        // const moduleToSwitchOff = modules.filter((x) =>
        //     previousPins.includes(x.portNum)
        // );
        // moduleToSwitchOff.forEach((module) => {
        //     module.execute(0);
        // });
        return true;
    }

    public static ofNull<T>(): Observable<T> {
        return of(null as T);
    }
}
