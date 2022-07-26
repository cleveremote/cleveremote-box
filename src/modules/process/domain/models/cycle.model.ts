import {
    ExecutableStatus,
    IExecutable,
} from '../interfaces/executable.interface';
import { ModuleModel } from './module.model';
import { SequenceModel } from './sequence.model';

export class CycleModel implements IExecutable {
    public id: string;
    public name: string;
    public style?: { bgColor: string; fontColor: string; iconColor: string };
    public description?: string;
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public progression?: { startedAt: Date; duration: number };
    public sequences: SequenceModel[] = [];

    public getModules(): ModuleModel[] {
        let modules: ModuleModel[] = [];
        this.sequences.forEach((sequence) => {
            modules = modules.concat(sequence.modules);
            modules = [...new Set([...modules, ...sequence.modules])];
        });
        return modules;
    }

    public exists(module: ModuleModel): boolean {
        return !!this.getModules().find(x => x.portNum === module.portNum);
    }

    public async reset(): Promise<boolean> {
        this.sequences.forEach(async (sequence) => {
            await sequence.reset();
        });
        this.status = ExecutableStatus.STOPPED;
        return true;
    }

    public getExecutionStructure(overrideDuration?: number): { sequenceId: string; portNums: number[]; duration: number }[] {
        const executionLst: { sequenceId: string; portNums: number[]; duration: number }[] = [];
        const sequences: SequenceModel[] = this.sequences;
        sequences.forEach((sequence) => {
            const sequenceId = sequence.id;
            const portNums = sequence.modules.map((x) => x.portNum);
            const duration = overrideDuration || sequence.duration;
            executionLst.push({ sequenceId, portNums, duration });
        });
        return executionLst;
    }
}
