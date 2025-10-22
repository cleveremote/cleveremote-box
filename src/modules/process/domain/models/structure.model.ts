import { CycleModel } from './cycle.model';
import { ModuleModel } from './module.model';
import { SensorModel } from './sensor.model';
import { SequenceModel } from './sequence.model';
export class StructureModel {
    public cycles: CycleModel[] = [];
    public sensors: SensorModel[] = [];
    public values: any[] = [];
    public getModules(): ModuleModel[] {
        let modules: ModuleModel[] = [];
        this.cycles.forEach((cycle) => {
            cycle.sequences.forEach((sequence) => {
                modules = modules.concat(sequence.modules);
                modules = [...new Set([...modules, ...sequence.modules])];
            });
        });
        return modules;
    }

    public getSequences(): SequenceModel[] {
        let sequences: SequenceModel[] = [];
        this.cycles.forEach((cycle) => {
            sequences = sequences.concat(cycle.sequences);
            sequences = [...new Set([...sequences, ...cycle.sequences])];
        });
        return sequences;
    }
}
