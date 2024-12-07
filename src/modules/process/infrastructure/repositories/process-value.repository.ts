import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ProcessValueEntity } from '../entities/process-value.entity';

@Injectable()
export class ProcessValueRepository implements IRepository<ProcessValueEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[1];
        }
        return null;
    }

    public async save(model: ProcessValueEntity): Promise<ProcessValueEntity> { 
        let result: ProcessValueEntity;
        const entity = ProcessValueEntity.mapToEntity(model); 
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
        return ProcessValueEntity.mapToModel(result);
    }

    public async create(entity: ProcessValueEntity): Promise<ProcessValueEntity> {
        await this.dbService.DB_VALUES.push('/processes[]', entity);
        const index = await this.dbService.DB_VALUES.getIndex('/processes', entity.id);
        const cycleFound = index !== -1 ? await this.dbService.DB_VALUES.getObject<ProcessValueEntity>(`/processes[${index}]`) : null;
        if (cycleFound) {
            return cycleFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'processes');
    }

    public async update(entity: ProcessValueEntity): Promise<ProcessValueEntity> {
        const index = await this.dbService.DB_VALUES.getIndex('/processes', entity.id);
        if (index !== -1) {
            await this.dbService.DB_VALUES.push(`/processes[${index}]`, entity);
            return await this.dbService.DB_VALUES.getObject<ProcessValueEntity>(`/processes[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'processes');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_VALUES.getIndex('/processes', id);
        if (index !== -1) {
            await this.dbService.DB_VALUES.delete(`/processes[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'processes');
    }

    public async get(id?: string): Promise<ProcessValueEntity | ProcessValueEntity[]> {
        if (!id) {
            return await this.dbService.DB_VALUES.getObject<ProcessValueEntity[]>('/processes');
        }
        const index = await this.dbService.DB_VALUES.getIndex('/processes', id);
        if (index !== -1) {
            return await this.dbService.DB_VALUES.getObject<ProcessValueEntity>(`/processes[${index}]`);
        }
        return null;
    }


}