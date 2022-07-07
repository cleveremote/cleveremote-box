import { CycleModel } from './cycle.model';
import { ModuleModel } from './module.model';
import { SequenceModel } from './sequence.model';


export class StructureModel {
    public cycles: CycleModel[] = [];
    public sequences: SequenceModel[] = [];

    public getModules(): ModuleModel[] {
        let modules: ModuleModel[] = [];
        this.sequences.forEach((sequence) => {
            modules = modules.concat(sequence.modules);
            modules = [...new Set([...modules, ...sequence.modules])];
        });
        this.cycles.forEach((cycle) => {
            cycle.sequences.forEach((sequence) => {
                modules = modules.concat(sequence.modules);
                modules = [...new Set([...modules, ...sequence.modules])];
            });
        });
        return modules;
    }
}
