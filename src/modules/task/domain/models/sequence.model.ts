import { IExecutable, ExecutableStatus, ExecutableAction, ExecutableType } from "../interfaces/executable.interface";
import { ModuleModel } from "./module.model";


export class SequenceModel implements IExecutable {

    public id: string;
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public duration: number;
    public modules: ModuleModel[] = [];


    public async execute(action: ExecutableAction): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    public getModules(): ModuleModel[] {
        throw new Error("Method not implemented.");
    }

    public exists(module: ModuleModel): boolean {
        throw new Error("Method not implemented.");
    }

    public async reset(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    public getType(): ExecutableType {
        return ExecutableType.SEQUENCE;
    }

    public getChilds(): ModuleModel[] {
        return this.modules;
    }

    public getExecutionStructure(): { portNum: number[]; duration: number; }[] {
        const executionLst: { portNum: number[]; duration: number; }[] = [];
        const modules: ModuleModel[] = this.modules;

        const portNums = this.modules.map((x) => x.portNum);
        const duration = this.duration;
        executionLst.push({ portNum: portNums, duration });
        return executionLst;
    }
}
