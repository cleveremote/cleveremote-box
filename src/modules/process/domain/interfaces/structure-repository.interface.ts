import { CycleModel } from '../models/cycle.model';
import { StructureModel } from '../models/structure.model';
import { IActuatorModule } from './actuator-module.interface';

export interface IStructureRepository {
    getStructure(): Promise<StructureModel>;
    getCycles(): Promise<CycleModel[]>;
    getModules(): Promise<IActuatorModule[]>;
    getCycle(id: string): Promise<CycleModel>;
    getModule(name: string): Promise<IActuatorModule>;
    saveStructure(structure: StructureModel): Promise<StructureModel>;
}
