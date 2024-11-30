/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CycleEntity } from '../entities/cycle.entity';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { CycleModel } from '@process/domain/models/cycle.model';

@Injectable()
export class CycleRepository implements IRepository<CycleEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[1];
        }
        return null;
    }

    public async save(model: CycleModel): Promise<CycleModel> {
        let result: CycleEntity;
        const entity = CycleEntity.mapToEntity(model);
        const idToDelete = this.shouldDelete(entity.id)
        if (idToDelete) {
            await this.delete(idToDelete);
            return entity;
        }
        const found = await this.get(entity.id);
        if (found) {
            result = await this.update(entity);
        } else {
            result = await this.create(entity);
        }
        this.dbService.executeBackUp('DB_STRUCTURE');
        return CycleEntity.mapToModel(result);
    }

    public async create(entity: CycleEntity): Promise<CycleEntity> {
        await this.dbService.DB_STRUCTURE.push('/cycles[]', entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex('/cycles', entity.id);
        const cycleFound = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<CycleEntity>(`/cycles[${index}]`) : null;
        if (cycleFound) {
            return cycleFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'cycle');
    }

    public async update(entity: CycleEntity): Promise<CycleEntity> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/cycles', entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`/cycles[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<CycleEntity>(`/cycles[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'cycle');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/cycles', id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`/cycles[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'cycle');
    }

    public async get(id?: string): Promise<CycleEntity | CycleEntity[]> {
        if (!id) {
            return await this.dbService.DB_STRUCTURE.getObject<CycleEntity[]>('/cycles');
        }
        const index = await this.dbService.DB_STRUCTURE.getIndex('/cycles', id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<CycleEntity>(`/cycles[${index}]`);
        }
        return null;
        //throw new ElementNotFoundExeception(id, 'get', 'cycle');
    }


}