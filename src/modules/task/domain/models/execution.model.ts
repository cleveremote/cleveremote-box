import { Module } from "@nestjs/core/injector/module";
import { delay, map, mergeMap, Observable, of } from "rxjs";
import { ExecutableAction, ExecutableMode, ConditionType, IExecutable, ExecutableType, ExecutableStatus } from "../interfaces/executable.interface";
import { ModuleStatus } from "../interfaces/structure.interface";
import { ModuleModel } from "./module.model";
import { SequenceModel } from "./sequence.model";


export class ExecutionModel {
    public task: IExecutable;
    public action: ExecutableAction;
    public type: ConditionType;
    public function: string;
    public mode: ExecutableMode;

    public execute(): boolean {

        const executionLst = this.task.getExecutionStructure();
        let obs: Observable<{ portNums: number[], duration: number }> = ExecutionModel.ofNull<{ portNums: number[], duration: number }>();

        executionLst.forEach((sequence, index) => {
            const o = this.createExecObs(executionLst[index - 1], sequence);
            obs = obs.pipe(mergeMap((x) => o));
        });

        this.task.status = ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        return true;
    }

    private createExecObs(previousSeq: { portNums: number[], duration: number }, currentSec: { portNums: number[], duration: number }) {
        return of(previousSeq?.portNums || []).pipe(
            mergeMap((previousPins) => {
                return of(currentSec.portNums).pipe(
                    map((currentPins) => {
                        console.log('previous pins' + previousPins);
                        console.log('current pins' + currentPins);
                        this.switchProcess(previousPins, currentPins);
                        return currentSec;
                    })
                );
            }),
            delay(currentSec.duration)
        );
    }

    private switchProcess(previousPins: number[], currentPins: number[]) {
        const modules = this.task.getModules();
        console.log('previous pins' + previousPins);
        console.log('current pins' + currentPins);
        const processedPreviousPins: number[] = [];
        currentPins.forEach(currentPin => {
            const currentModule = modules.find(x => x.portNum === currentPin);
            if (previousPins.includes(currentPin)) {
                if (currentModule.status !== ModuleStatus.ON) {
                    currentModule.execute(1);
                    processedPreviousPins.push(currentPin);
                }
            } else {
                currentModule.execute(1);
            }
        });
        previousPins.filter(x => !processedPreviousPins.includes(x));
        const moduleToSwitchOff = modules.filter(x => previousPins.includes(x.portNum));
        moduleToSwitchOff.forEach(module => {
            module.execute(0);
        });
    }

    public static ofNull<T>(): Observable<T> {
        return of(null as T);
    }
}
