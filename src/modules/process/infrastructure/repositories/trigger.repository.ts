/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { TriggerEntity } from '../entities/trigger.entity';
import { TriggerModel } from '@process/domain/models/trigger.model';

@Injectable()
export class TriggerRepository implements IRepository<TriggerEntity> {

    public constructor(private dbService: DbService) { }
    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[0];
        }
        return null;
    }

    public async save(model: TriggerModel): Promise<TriggerModel> {
        let result: TriggerEntity;
        const entity = TriggerEntity.mapToEntity(model);
        const idToDelete = this.shouldDelete(entity.id);
        if (idToDelete) {
            await this.delete(idToDelete, entity.cycleId);
            result = null;
        }
        const found = await this.get(entity.id, entity.cycleId);
        if (found) {
            result = await this.update(entity);
        } else {
            result = await this.create(entity);
        }
        this.dbService.executeBackUp('DB_STRUCTURE');
        return TriggerEntity.mapToModel(result);
    }

    public async create(entity: TriggerEntity): Promise<TriggerEntity> {
        const parentNode = await this._getParentNode(entity.cycleId);
        await this.dbService.DB_STRUCTURE.push(`${parentNode}/triggers[]`, entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/triggers`, entity.id);
        const found = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<TriggerEntity>(`${parentNode}/triggers[${index}]`) : null;
        if (found) {
            return found;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'trigger');
    }

    public async update(entity: TriggerEntity): Promise<TriggerEntity> {
        const parentNode = await this._getParentNode(entity.cycleId);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/triggers`, entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`${parentNode}/triggers[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<TriggerEntity>(`${parentNode}/triggers[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'update', 'trigger');
    }

    public async delete(id: string, parentId: string): Promise<boolean> {
        const parentNode = await this._getParentNode(parentId);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/triggers`, id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`${parentNode}/triggers[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'trigger');
    }

    public async get(id: string, parentId: string): Promise<TriggerEntity> {
        const parentNode = await this._getParentNode(parentId);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/triggers`, id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<TriggerEntity>(`${parentNode}/triggers[${index}]`);
        }
        return null;
    }

    private async _getParentNode(parentId: string): Promise<string> {
        const cycleIndex = await this.dbService.DB_STRUCTURE.getIndex('/cycles', parentId);
        return cycleIndex !== -1 ? `/cycles[${cycleIndex}]` : null;
    }

}