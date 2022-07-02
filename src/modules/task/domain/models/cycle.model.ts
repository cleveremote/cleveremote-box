import { ExecutableAction, ExecutableStatus, ExecutableType, IExecutable } from "../interfaces/executable.interface";
import { ModuleModel } from "./module.model";
import { SequenceModel } from "./sequence.model";


export class CycleModel implements IExecutable {
    public id: string;
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public sequences: SequenceModel[] = [];

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
        return ExecutableType.CYCLE;
    }

    public getChilds(): SequenceModel[] {
        return this.sequences;
    }

    public getExecutionStructure(): { portNum: number[]; duration: number; }[] {
        const executionLst: { portNum: number[]; duration: number; }[] = [];
        const sequences: SequenceModel[] = this.sequences;
        sequences.forEach(sequence => {
            const portNums = sequence.modules.map((x) => x.portNum);
            const duration = sequence.duration;
            executionLst.push({ portNum: portNums, duration });
        });
        return executionLst;
    }
}
