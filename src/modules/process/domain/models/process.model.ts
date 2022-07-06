import { delay, lastValueFrom, map, mergeMap, Observable, of } from 'rxjs';
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

    // eslint-disable-next-line max-lines-per-function
    public execute(): Promise<boolean> {
        if (this.action === ExecutableAction.OFF) {
            return this.task.reset().then((data) => {
                this.task.status = ExecutableStatus.STOPPED;
                return data;
            });
        }

        const executionLst = this.task.getExecutionStructure();
        let obs: Observable<{ portNums: number[]; duration: number } | boolean> =
            ProcessModel.ofNull<{ portNums: number[]; duration: number } | boolean>();

        executionLst.forEach((sequence, index) => {
            const o = this.createExecObs(executionLst[index - 1], sequence);
            obs = obs.pipe(mergeMap(() => o));
        });

        const obsChaining = obs.pipe(map(() => {
            this.task.status = ExecutableStatus.IN_PROCCESS;
            return true;
        }));

        return lastValueFrom(obsChaining);


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
        currentPins.forEach((currentPin) => {
            const currentModule = modules.find((x) => x.portNum === currentPin);
            if (previousPins.includes(currentPin)) {
                if (currentModule.status !== ModuleStatus.ON) {
                    currentModule.execute(1);
                    processedPreviousPins.push(currentPin);
                }
            } else {
                currentModule.execute(1);
            }
        });
        previousPins = previousPins.filter((x) => !processedPreviousPins.includes(x));
        const moduleToSwitchOff = modules.filter((x) =>
            previousPins.includes(x.portNum)
        );
        moduleToSwitchOff.forEach((module) => {
            module.execute(0);
        });
        return true;
    }

    public static ofNull<T>(): Observable<T> {
        return of(null as T);
    }
}
