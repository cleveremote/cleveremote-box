import { ExecutableStatus } from "../interfaces/executable.interface";
import { ModuleModel } from "./module.model";


export class SequenceModel {

    public id: string;
    public name: string;
    public description: string;
    public progression: { startedAt: Date; duration: number };
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public duration: number;
    public modules: ModuleModel[] = [];

    public async reset(): Promise<boolean> {
        this.modules.forEach(module => {
            try {
                module.execute(0);
            } catch (error) {
                console.log('stopped');
            }
        });
        this.status = ExecutableStatus.STOPPED;
        this.progression = null;
        return true;
    }
}
