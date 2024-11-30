/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { SensorEntity } from '../entities/sensor.entity';
import { SensorModel } from '@process/domain/models/sensor.model';

@Injectable()
export class SensorRepository implements IRepository<SensorEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[1];
        }
        return null;
    }

    public async save(model: SensorModel): Promise<SensorModel> {
        let result: SensorModel;
        const entity = SensorEntity.mapToEntity(model);
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
        return SensorEntity.mapToModel(result);
    }

    public async create(entity: SensorEntity): Promise<SensorEntity> {
        await this.dbService.DB_STRUCTURE.push('/sensors[]', entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex('/sensors', entity.id);
        const cycleFound = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<SensorEntity>(`/sensors[${index}]`) : null;
        if (cycleFound) {
            return cycleFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'sensor');
    }

    public async update(entity: SensorEntity): Promise<SensorEntity> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/sensors', entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`/sensors[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<SensorEntity>(`/sensors[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'sensor');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/sensors', id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`/sensors[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'sensor');
    }

    public async get(id: string): Promise<SensorEntity | SensorEntity[]> {
        if (!id) {
            return await this.dbService.DB_STRUCTURE.getObject<SensorEntity[]>('/sensors');
        }
        const index = await this.dbService.DB_STRUCTURE.getIndex('/sensors', id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<SensorEntity>(`/sensors[${index}]`);
        }
        return null;
    }


}