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

export interface IRepository<T> {
    create(entity: T): Promise<T>;
    update(entity: T): Promise<T>;
    delete(id: string, parentId?: string): Promise<boolean>;
    get(id?: string | string[], parentId?: string): Promise<T | T[]>;
    shouldDelete(id: string, parentId?: string): string;
}
