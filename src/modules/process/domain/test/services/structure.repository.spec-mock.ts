import { IStructureRepository } from '@process/domain/interfaces/structure-repository.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { CreateStructure } from './structure.model.spec-mock';

export class StructureRepositorySpecMock implements IStructureRepository {

    private _structure: StructureModel;

    public constructor() {
        this._structure = CreateStructure();
    }

    public getStructure(): Promise<StructureModel> {
        return Promise.resolve(this._structure);
    }

    public getCycles(): Promise<CycleModel[]> {
        return Promise.resolve(this._structure.cycles);
    }

    public getModules(): Promise<ModuleModel[]> {
        const modules = this._structure.getModules();
        return Promise.resolve(modules);
    }

    public getCycle(id: string): Promise<CycleModel> {
        const cycle = this._structure.cycles.find((x) => x.id === id);
        return Promise.resolve(cycle);
    }
    
    public getModule(portNum: number): Promise<ModuleModel> {
        const module = this._structure.getModules().find((x) => x.portNum === portNum);
        return Promise.resolve(module);
    }
    public saveStructure(structure: StructureModel): Promise<StructureModel> {
        return Promise.resolve(structure);
    }

     // eslint-disable-next-line @typescript-eslint/no-unused-vars
     public async getSequence(_id: string): Promise<SequenceModel> {
        throw new Error('Method not implemented.');
    }
}