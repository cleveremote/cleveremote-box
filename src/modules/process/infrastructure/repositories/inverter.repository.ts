import { IRepository } from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { InverterModel } from '@process/domain/models/inverter.model';
import { InverterEntity } from '../entities/inverter.entity';

@Injectable()
export class InverterRepository implements IRepository<InverterEntity> {

    public constructor(private dbService: DbService) {}

    public shouldDelete(id: string): string {
        const parts = id.split('_');
        return parts.length > 1 && parts[0] === 'deleted' ? parts[1] : null;
    }

    public async save(model: InverterModel): Promise<InverterModel> {
        const entity = InverterEntity.mapToEntity(model);
        const idToDelete = this.shouldDelete(entity.id);
        if (idToDelete) {
            await this.delete(idToDelete);
            return entity;
        }
        const found = await this.get(entity.id);
        const result = found ? await this.update(entity) : await this.create(entity);
        this.dbService.executeBackUp('DB_STRUCTURE');
        return InverterEntity.mapToModel(result as InverterEntity);
    }

    public async create(entity: InverterEntity): Promise<InverterEntity> {
        await this.dbService.DB_STRUCTURE.push('/inverters[]', entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex('/inverters', entity.id);
        const found = index !== -1
            ? await this.dbService.DB_STRUCTURE.getObject<InverterEntity>(`/inverters[${index}]`)
            : null;
        if (found) return found;
        throw new ElementNotFoundExeception(entity.id, 'create', 'inverter');
    }

    public async update(entity: InverterEntity): Promise<InverterEntity> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/inverters', entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`/inverters[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<InverterEntity>(`/inverters[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'update', 'inverter');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/inverters', id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`/inverters[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'inverter');
    }

    public async get(id?: string): Promise<InverterEntity | InverterEntity[]> {
        if (!id) {
            return await this.dbService.DB_STRUCTURE.getObject<InverterEntity[]>('/inverters');
        }
        const index = await this.dbService.DB_STRUCTURE.getIndex('/inverters', id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<InverterEntity>(`/inverters[${index}]`);
        }
        return null;
    }
}
