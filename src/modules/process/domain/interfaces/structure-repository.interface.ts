import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { StructureModel } from '../models/structure.model';
//import { ExecutableStatus, ReadableElementType } from './executable.interface';

export interface IStructureRepository {
    getStructure(): Promise<StructureModel>;
    getCycles(): Promise<CycleModel[]>;
    getModules(): Promise<ModuleModel[]>;
    getCycle(id: string): Promise<CycleModel>;
    getModule(portNum: number): Promise<ModuleModel>;
    saveStructure(structure: StructureModel): Promise<StructureModel>;
}

export interface IRepository<T> {
    create(entity: T): Promise<T>;
    update(entity: T): Promise<T>;
    delete(id: string, parentId?: string): Promise<boolean>;
    get(id?: string | string[], parentId?: string): Promise<T | T[]>;
    shouldDelete(id: string, parentId?: string): string;
}

export interface ISensorValueold {
    // id: string;
    // type: ReadableElementType;
    // value: number;
}

export interface IExecutableStateold {
    // id: string;
    // type: ReadableElementType;
    // status: ExecutableStatus;
    // startedAt: Date;
    // duration: number;
}







//{ id: data.id, value: data.value }
//{ type: ExecutableType; id: string; status: ExecutableStatus; startedAt: Date; duration: number }
