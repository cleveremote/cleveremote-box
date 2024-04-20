import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { SensorValueEntity } from '../entities/sensor-value.entity';

@Injectable()
export class SensorValueRepository implements IRepository<SensorValueEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedCycleId = id.split('_');
        if (splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted') {
            return splittedCycleId[1];
        }
        return null;
    }

    public async save(model: SensorValueEntity): Promise<SensorValueEntity> {
        let result: SensorValueEntity;
        const entity = SensorValueEntity.mapToEntity(model);
        const idToDelete = this.shouldDelete(entity.id)
        if (idToDelete) {
            await this.delete(idToDelete);
            return null;
        }
        const found = await this.get(entity.id);
        if (found) {
            result = await this.update(entity);
        } else {
            result = await this.create(entity);
        }

        return SensorValueEntity.mapToModel(result);
    }

    public async create(entity: SensorValueEntity): Promise<SensorValueEntity> {
        await this.dbService.DB_VALUES.push('/sensors[]', entity);
        const index = await this.dbService.DB_VALUES.getIndex('/sensors', entity.id);
        const cycleFound = index !== -1 ? await this.dbService.DB_VALUES.getObject<SensorValueEntity>(`/sensors[${index}]`) : null;
        if (cycleFound) {
            return cycleFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'sensors');
    }

    public async update(entity: SensorValueEntity): Promise<SensorValueEntity> {
        const index = await this.dbService.DB_VALUES.getIndex('/sensors', entity.id);
        if (index !== -1) {
            await this.dbService.DB_VALUES.push(`/sensors[${index}]`, entity);
            return await this.dbService.DB_VALUES.getObject<SensorValueEntity>(`/sensors[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'sensors');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_VALUES.getIndex('/sensors', id);
        if (index !== -1) {
            await this.dbService.DB_VALUES.delete(`/sensors[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'sensors');
    }

    public async get(id?: string): Promise<SensorValueEntity | SensorValueEntity[]> {
        if (!id) {
            return await this.dbService.DB_VALUES.getObject<SensorValueEntity[]>('/sensors');
        }
        const index = await this.dbService.DB_VALUES.getIndex('/sensors', id);
        if (index !== -1) {
            return await this.dbService.DB_VALUES.getObject<SensorValueEntity>(`/sensors[${index}]`);
        }
        return null;
    }


}