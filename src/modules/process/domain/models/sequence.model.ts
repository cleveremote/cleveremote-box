import { IExecutable, ExecutableStatus } from "../interfaces/executable.interface";
import { ModuleModel } from "./module.model";


export class SequenceModel implements IExecutable {

    public id: string;
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public duration: number;
    public modules: ModuleModel[] = [];

    public getModules(): ModuleModel[] {
        return this.modules;
    }

    public exists(module: ModuleModel): boolean {
        return !!this.modules.find(x => x.portNum === module.portNum)
    }

    public async reset(): Promise<boolean> {
        this.modules.forEach(module => {
             // test purpose only particular use case
            if (module.portNum !== 2022) {
                module.execute(0);
            }
        });
        this.status = ExecutableStatus.STOPPED;
        return true;
    }

    public getExecutionStructure(): { portNums: number[]; duration: number; }[] {
        const executionLst: { portNums: number[]; duration: number; }[] = [];
        const portNums = this.modules.map((x) => x.portNum);
        const duration = this.duration;
        executionLst.push({ portNums: portNums, duration });
        return executionLst;
    }
}
