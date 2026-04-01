/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ModbusTaskConfigEntity } from '../entities/modbusTaskConfig.entity';
import { ModbusTaskConfigModel } from '@process/domain/models/modbusTaskConfig.model';

@Injectable()
export class ModbusTaskRepository implements IRepository<ModbusTaskConfigEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[1];
        }
        return null;
    }

    public async save(model: ModbusTaskConfigModel): Promise<ModbusTaskConfigModel> {
        let result: ModbusTaskConfigModel;
        const entity = ModbusTaskConfigEntity.mapToEntity(model);
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
        return ModbusTaskConfigEntity.mapToModel(result);
    }

    public async create(entity: ModbusTaskConfigEntity): Promise<ModbusTaskConfigEntity> {
        await this.dbService.DB_STRUCTURE.push('/modbusTasks[]', entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusTasks', entity.id);
        const cycleFound = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<ModbusTaskConfigEntity>(`/modbusTasks[${index}]`) : null;
        if (cycleFound) {
            return cycleFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'modbusTask');
    }

    public async update(entity: ModbusTaskConfigEntity): Promise<ModbusTaskConfigEntity> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusTasks', entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`/modbusTasks[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<ModbusTaskConfigEntity>(`/modbusTasks[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'modbusTask');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusTasks', id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`/modbusTasks[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'modbusTask');
    }

    public async get(id?: string): Promise<ModbusTaskConfigEntity | ModbusTaskConfigEntity[]> {
        if (!id) {
            return await this.dbService.DB_STRUCTURE.getObject<ModbusTaskConfigEntity[]>('/modbusTasks');
        }
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusTasks', id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<ModbusTaskConfigEntity>(`/modbusTasks[${index}]`);
        }
        return null;
    }


}