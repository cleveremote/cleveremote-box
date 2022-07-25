import { IExecutable, ExecutableStatus } from "../interfaces/executable.interface";
import { ModuleModel } from "./module.model";


export class SequenceModel {

    public id: string;
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public duration: number;
    public modules: ModuleModel[] = [];
    public name: string;
    public description?: string;
    public startedAt?: Date;

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
}
