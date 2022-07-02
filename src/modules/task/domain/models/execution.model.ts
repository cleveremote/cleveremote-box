import { Module } from "@nestjs/core/injector/module";
import { delay, map, mergeMap, Observable, of } from "rxjs";
import { ExecutableAction, ExecutableMode, ConditionType, IExecutable, ExecutableType, ExecutableStatus } from "../interfaces/executable.interface";
import { ModuleModel } from "./module.model";
import { SequenceModel } from "./sequence.model";


export class ExecutionModel {
    public task: IExecutable;
    public action: ExecutableAction;
    public type: ConditionType;
    public function: string;
    public mode: ExecutableMode;

    public async execute(): Promise<boolean> {

        const executionLst = this.task.getExecutionStructure();
        let obs: Observable<{ portNum: number[], duration: number }> = ExecutionModel.ofNull<{ portNum: number[], duration: number }>();

        executionLst.forEach((sequence, index) => {
            const o = this.createExecObs(executionLst[index - 1], sequence);
            obs = obs.pipe(mergeMap((x) => o));
        });

        this.task.status = ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        throw new Error("Method not implemented.");
    }



    private createExecObs(previousSeq: { portNum: number[], duration: number }, currentSec: { portNum: number[], duration: number }) {
        return of(previousSeq?.portNum || []).pipe(
            mergeMap((previousPins) => {
                return of(currentSec.portNum).pipe(
                    map((currentPins) => {
                        console.log('previous pins' + previousPins);
                        console.log('current pins' + currentPins);
                        // Same don’t modify example 1 is ON don’t switch off if exist in previous.
                        return currentSec;
                    })
                );
            }),
            delay(currentSec.duration)
        );
    }

    public static ofNull<T>(): Observable<T> {
        return of(null as T);
    }
}
