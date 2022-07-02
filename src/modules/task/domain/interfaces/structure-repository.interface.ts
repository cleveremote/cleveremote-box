import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';

export interface IStructureRepository {
    getCycles(): Promise<CycleModel[]>;
    getSequences(): Promise<SequenceModel[]>;
    getModules(): Promise<ModuleModel[]>;
    getCycle(id: string): Promise<CycleModel>;
    getSequence(id: string): Promise<SequenceModel>;
    getModule(id: string): Promise<ModuleModel>;
    savecStructure(structure: StructureModel):Promise<StructureModel>;
}