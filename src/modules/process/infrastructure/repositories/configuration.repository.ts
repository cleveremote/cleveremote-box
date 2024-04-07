import { IExecutableState, ISensorValue, IStructureRepository, IValueResponse } from '@process/domain/interfaces/structure-repository.interface';
import { CycleModel } from '../../domain/models/cycle.model';
import { ModuleModel } from '../../domain/models/module.model';
import { SequenceModel } from '../../domain/models/sequence.model';
import { StructureModel } from '../../domain/models/structure.model';
import * as fs from 'fs/promises';
import { StructureEntity } from '../entities/structure.entity';
import { StructureInvalidError } from '@process/domain/errors/structure-invalid.error';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ExecutableStatus, ReadableElementType } from '@process/domain/interfaces/executable.interface';

@Injectable()
export class ConfigurationRepository implements IStructureRepository {

    public constructor(private dbService: DbService) { }

    public async setValues<T>(data: ISensorValue | IExecutableState): Promise<IValueResponse[]> {

        const nodeName = this._mappingTypeToDBType(data.type);
        const index = await this.dbService.DB_VALUES.getIndex(`/${nodeName}`, data.id);
        const pos = index === -1 ? '[]' : `[${index}]`;
        await this.dbService.DB_VALUES.push(`/${nodeName}${pos}`, data);
        const result = await this.dbService.DB_VALUES.getData(`/${nodeName}`);
        if (result) {
            return result.map((res: { id: string; value: number; status: ExecutableStatus, type: ReadableElementType }) =>
                ({ id: res.id, value: res.status || res.value , type: res.type }))
        }
        return [];
    }

    private _mappingTypeToDBType(type: string): string {
        switch (type) {
            case 'CYCLE':
                return 'cycles';
            case 'SEQUENCE':
                return 'sequences'
            case 'SENSOR':
                return 'sensors'
        }
    }

    public async getStructure(): Promise<StructureModel> {
        const structureEntity = new StructureEntity();
        structureEntity.configuration = await fs.readFile('./box.cfg', { encoding: 'utf8' });
        if (structureEntity.configuration) {
            return StructureEntity.mapToStructureModel(structureEntity);
        }
        throw new StructureInvalidError();
    }

    public async saveStructure(structureModel: StructureModel): Promise<StructureModel> {
        const entity = StructureEntity.mapToStructureEntity(structureModel);
        if (entity) {
            await fs.writeFile('./box.cfg', entity.configuration, { encoding: 'utf8' });
            return structureModel;
        }
        throw new StructureInvalidError();
    }

    public async insertProcessStatus(data: any): Promise<any[]> {
        return await this.setValues(data);
    }

    public async getProcessesStatus(type: string = '/'): Promise<any> {
        return await this.dbService.DB_VALUES.getData(type);
    }

    public async getCycles(): Promise<CycleModel[]> {
        throw new Error('Method not implemented.');
    }

    public async getModules(): Promise<ModuleModel[]> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getCycle(_id: string): Promise<CycleModel> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getSequence(_id: string): Promise<SequenceModel> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getModule(_portNum: number): Promise<ModuleModel> {
        throw new Error('Method not implemented.');
    }

}