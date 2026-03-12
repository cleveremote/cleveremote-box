/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ModbusConnectionConfigModel } from '@process/domain/models/modbusConnectionConfig.model';
import { ModbusConnectionConfigEntity } from '../entities/modbusConnetionConfig.entity';

@Injectable()
export class ModbusConnectionRepository implements IRepository<ModbusConnectionConfigEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[1];
        }
        return null;
    }

    public async save(model: ModbusConnectionConfigModel): Promise<ModbusConnectionConfigModel> {
        let result: ModbusConnectionConfigModel;
        const entity = ModbusConnectionConfigEntity.mapToEntity(model);
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
        return ModbusConnectionConfigEntity.mapToModel(result);
    }

    public async create(entity: ModbusConnectionConfigEntity): Promise<ModbusConnectionConfigEntity> {
        await this.dbService.DB_STRUCTURE.push('/modbusConnections[]', entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusConnections', entity.id);
        const cycleFound = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<ModbusConnectionConfigEntity>(`/modbusConnections[${index}]`) : null;
        if (cycleFound) {
            return cycleFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'modbusConnection');
    }

    public async update(entity: ModbusConnectionConfigEntity): Promise<ModbusConnectionConfigEntity> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusConnections', entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`/modbusConnections[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<ModbusConnectionConfigEntity>(`/modbusConnections[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'modbusConnection');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusConnections', id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`/modbusConnections[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'modbusConnection');
    }

    public async get(id: string): Promise<ModbusConnectionConfigEntity | ModbusConnectionConfigEntity[]> {
        if (!id) {
            return await this.dbService.DB_STRUCTURE.getObject<ModbusConnectionConfigEntity[]>('/modbusConnections');
        }
        const index = await this.dbService.DB_STRUCTURE.getIndex('/modbusConnections', id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<ModbusConnectionConfigEntity>(`/modbusConnections[${index}]`);
        }
        return null;
    }


}