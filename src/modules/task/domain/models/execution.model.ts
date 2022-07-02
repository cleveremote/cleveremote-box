import { Module } from "@nestjs/core/injector/module";
import { ExecutableAction, ExecutableMode, ExecutableType, IExecutable } from "../interfaces/executable.interface";


export class ExecutionModel {
    public task: IExecutable;
    public action: ExecutableAction;
    public type: ExecutableType;
    public function : string;
    public mode : ExecutableMode;
    public async execute(): Promise<boolean> {
        
        throw new Error("Method not implemented.");
    }

    private buildExecutionStruct():
}
