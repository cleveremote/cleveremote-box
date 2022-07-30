import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { StructureModel } from '../models/structure.model';

export interface IStructureRepository {
    getStructure(): Promise<StructureModel>;
    getCycles(): Promise<CycleModel[]>;
    getModules(): Promise<ModuleModel[]>;
    getCycle(id: string): Promise<CycleModel>;
    getModule(portNum: number): Promise<ModuleModel>;
    saveStructure(structure: StructureModel): Promise<StructureModel>;
}