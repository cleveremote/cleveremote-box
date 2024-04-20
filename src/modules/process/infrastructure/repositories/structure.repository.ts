/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { StructureModel } from '../../domain/models/structure.model';
import { StructureEntity } from '../entities/structure.entity';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';

@Injectable()
export class StructureRepository implements IRepository<StructureEntity> {

    public constructor(private dbService: DbService) { }

    public async save(model: StructureModel): Promise<StructureModel> {
        const entity = StructureEntity.mapToEntity(model);
        const result = await this.create(entity);
        this.dbService.executeBackUp('DB_STRUCTURE');
        return StructureEntity.mapToModel(result);
    }

    public async create(entity: StructureEntity): Promise<StructureEntity> {
        await this.dbService.DB_STRUCTURE.push('/', entity);
        return await this.dbService.DB_STRUCTURE.getObject<StructureEntity>('/');
    }

    public async get(): Promise<StructureEntity> {
        return await this.dbService.DB_STRUCTURE.getObject<StructureEntity>('/');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public update(_entity: StructureEntity): Promise<StructureEntity> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public delete(_id: string, _parentId?: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public shouldDelete(_id: string): string {
        throw new Error('Method not implemented.');
    }

    // ////////////////////

    // public async setValues(data: ISensorValue | IExecutableState): Promise<IValueResponse[]> {

    //     const nodeName = `${data.type.toLowerCase()}s`;
    //     const index = await this.dbService.DB_VALUES.getIndex(`/${nodeName}`, data.id);
    //     const pos = index === -1 ? '[]' : `[${index}]`;
    //     await this.dbService.DB_VALUES.push(`/${nodeName}${pos}`, data);
    //     const result = await this.dbService.DB_VALUES.getData(`/${nodeName}`);
    //     if (result) {
    //         return result.map((res: { id: string; value: number; status: ExecutableStatus, type: ReadableElementType }) =>
    //             ({ id: res.id, value: res.status || res.value, type: res.type }))
    //     }
    //     return [];
    // }


    // public async getValues(type: string = '/', id?: string): Promise<IValueResponse | any> {
    //     if (id) {
    //         const nodeName = `${type.toLowerCase()}s`;
    //         const index = await this.dbService.DB_VALUES.getIndex(`/${nodeName}`, id);
    //         return index > -1 ? await this.dbService.DB_VALUES.getData(`/${nodeName}[${index}]`) : null;
    //     }
    //     return await this.dbService.DB_VALUES.getData(type);
    // }

}