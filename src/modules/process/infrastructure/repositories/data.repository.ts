import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { DataEntity } from '../entities/data.entity';
import { DataModel } from '@process/domain/models/data.model';

@Injectable()
export class DataRepository implements IRepository<DataEntity> {

    public constructor(private dbService: DbService) { }
    shouldDelete(id: string, parentId?: string): string {
        throw new Error('Method not implemented.');
    }

    public async save(model: DataEntity): Promise<DataModel> {
        let result: DataEntity;
        const entity = DataEntity.mapToEntity(model);

        result = await this.create(entity);
        return DataEntity.mapToModel(result);
    }

    public async create(entity: DataEntity): Promise<DataEntity> {
        const key = `${entity.date.getMonth()}-${entity.date.getFullYear()}`;
        await this.dbService.DB_SENSOR_VALUE[key].push('/data[]', entity); 
        return entity;
    }

    public async update(entity: DataEntity): Promise<DataEntity> {
        throw new ElementNotFoundExeception(entity.id, 'get', 'sensors');
    }

    public async delete(id: string): Promise<boolean> {
        throw new ElementNotFoundExeception(id, 'delete', 'sensors');
    }

    public async get(key: string): Promise<DataEntity | DataEntity[]> {
        return await this.dbService.DB_SENSOR_VALUE[key].getObject<DataEntity[]>('/data');
    }


}