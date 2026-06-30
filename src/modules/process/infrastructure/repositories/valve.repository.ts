/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ValveEntity } from '../entities/valve.entity';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ValveConfigModel } from '@process/domain/models/valve.model';

@Injectable()
export class ValveRepository implements IRepository<ValveEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedValveId = id.split('_');
        if (splittedValveId.length > 1 && splittedValveId[0] === 'deleted') {
            return splittedValveId[1];
        }
        return null;
    }

    public async save(model: ValveConfigModel): Promise<ValveConfigModel> {
        let result: ValveEntity;
        const entity = ValveEntity.mapToEntity(model);
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
        return ValveEntity.mapToModel(result);
    }

    public async create(entity: ValveEntity): Promise<ValveEntity> {
        await this.dbService.DB_STRUCTURE.push('/valves[]', entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex('/valves', entity.id);
        const valveFound = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<ValveEntity>(`/valves[${index}]`) : null;
        if (valveFound) {
            return valveFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'valve');
    }

    public async update(entity: ValveEntity): Promise<ValveEntity> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/valves', entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`/valves[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<ValveEntity>(`/valves[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'valve');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/valves', id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`/valves[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'valve');
    }

    public async get(id?: string): Promise<ValveEntity | ValveEntity[]> {
        if (!id) {
            return await this.dbService.DB_STRUCTURE.getObject<ValveEntity[]>('/valves');
        }
        const index = await this.dbService.DB_STRUCTURE.getIndex('/valves', id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<ValveEntity>(`/valves[${index}]`);
        }
        return null;
    }

}
