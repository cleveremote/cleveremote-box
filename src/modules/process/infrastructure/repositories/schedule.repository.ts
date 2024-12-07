/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ScheduleEntity } from '../entities/schedule.entity';

@Injectable()
export class ScheduleRepository implements IRepository<ScheduleEntity> {

    public constructor(private dbService: DbService) { }
    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[1];
        }
        return null;
    }

    public async save(entity: ScheduleEntity): Promise<ScheduleEntity> {
        let result: ScheduleEntity;
        const idToDelete = this.shouldDelete(entity.id)
        if (idToDelete) {
            await this.delete(idToDelete, entity.cycleId);
            return entity;
        }
        const found = await this.get(entity.id, entity.cycleId);
        if (found) {
            result = await this.update(entity);
        } else {
            result = await this.create(entity);
        }
        this.dbService.executeBackUp('DB_STRUCTURE');
        return ScheduleEntity.mapToModel(result);
    }

    public async create(entity: ScheduleEntity): Promise<ScheduleEntity> {
        const parentNode = await this._getParentNode(entity.cycleId);
        await this.dbService.DB_STRUCTURE.push(`${parentNode}/schedules[]`, entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/schedules`, entity.id);
        const found = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<ScheduleEntity>(`${parentNode}/schedules[${index}]`) : null;
        if (found) {
            return found;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'schedule');
    }

    public async update(entity: ScheduleEntity): Promise<ScheduleEntity> {
        const parentNode = await this._getParentNode(entity.cycleId);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/schedules`, entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`${parentNode}/schedules[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<ScheduleEntity>(`${parentNode}/schedules[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'update', 'schedule');
    }

    public async delete(id: string, parentId: string): Promise<boolean> {
        const parentNode = await this._getParentNode(parentId);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/schedules`, id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`${parentNode}/schedules[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'schedule');
    }

    public async get(id: string, parentId: string): Promise<ScheduleEntity> {
        const parentNode = await this._getParentNode(parentId);
        const index = await this.dbService.DB_STRUCTURE.getIndex(`${parentNode}/schedules`, id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<ScheduleEntity>(`${parentNode}/schedules[${index}]`);
        }
        return null;
    }

    private async _getParentNode(parentId: string): Promise<string> {
        const cycleIndex = await this.dbService.DB_STRUCTURE.getIndex('/cycles', parentId);
        return cycleIndex !== -1 ? `/cycles[${cycleIndex}]` : null;
    }

}