import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { StructureModel } from '../models/structure.model';
import { ExecutableStatus, ExecutableType, ReadableElementType } from './executable.interface';

export interface IStructureRepository {
    getStructure(): Promise<StructureModel>;
    getCycles(): Promise<CycleModel[]>;
    getModules(): Promise<ModuleModel[]>;
    getCycle(id: string): Promise<CycleModel>;
    getModule(portNum: number): Promise<ModuleModel>;
    saveStructure(structure: StructureModel): Promise<StructureModel>;
}

export interface ISensorValue {
    id: string;
    type: ReadableElementType;
    value: number;
}

export interface IExecutableState {
    id: string;
    type: ReadableElementType;
    status: ExecutableStatus;
    startedAt: Date;
    duration: number;
}

export interface IValueResponse {
    id: string;
    type: ReadableElementType;
    value: number | ExecutableStatus;
}





//{ id: data.id, value: data.value }
//{ type: ExecutableType; id: string; status: ExecutableStatus; startedAt: Date; duration: number }
