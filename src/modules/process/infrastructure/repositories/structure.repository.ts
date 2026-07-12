/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { StructureModel } from '../../domain/models/structure.model';
import { StructureEntity } from '../entities/structure.entity';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

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

}