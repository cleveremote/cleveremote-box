/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { TaskEntity } from '../entities/task.entity';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { TaskModel } from '@process/domain/models/task.model';

@Injectable()
export class TaskRepository implements IRepository<TaskEntity> {

    public constructor(private dbService: DbService) { }

    public shouldDelete(id: string): string {
        const splittedTaskId = id.split('_');
        if (splittedTaskId.length > 1 && splittedTaskId[0] === 'deleted') {
            return splittedTaskId[1];
        }
        return null;
    }

    public async save(model: TaskModel): Promise<TaskModel> {
        let result: TaskEntity;
        const entity = TaskEntity.mapToEntity(model);
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
        return TaskEntity.mapToModel(result);
    }

    public async create(entity: TaskEntity): Promise<TaskEntity> {
        await this.dbService.DB_STRUCTURE.push('/tasks[]', entity);
        const index = await this.dbService.DB_STRUCTURE.getIndex('/tasks', entity.id);
        const taskFound = index !== -1 ? await this.dbService.DB_STRUCTURE.getObject<TaskEntity>(`/tasks[${index}]`) : null;
        if (taskFound) {
            return taskFound;
        }
        throw new ElementNotFoundExeception(entity.id, 'create', 'task');
    }

    public async update(entity: TaskEntity): Promise<TaskEntity> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/tasks', entity.id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.push(`/tasks[${index}]`, entity);
            return await this.dbService.DB_STRUCTURE.getObject<TaskEntity>(`/tasks[${index}]`);
        }
        throw new ElementNotFoundExeception(entity.id, 'get', 'task');
    }

    public async delete(id: string): Promise<boolean> {
        const index = await this.dbService.DB_STRUCTURE.getIndex('/tasks', id);
        if (index !== -1) {
            await this.dbService.DB_STRUCTURE.delete(`/tasks[${index}]`);
            return true;
        }
        throw new ElementNotFoundExeception(id, 'delete', 'task');
    }

    public async get(id?: string): Promise<TaskEntity | TaskEntity[]> {
        if (!id) {
            return await this.dbService.DB_STRUCTURE.getObject<TaskEntity[]>('/tasks');
        }
        const index = await this.dbService.DB_STRUCTURE.getIndex('/tasks', id);
        if (index !== -1) {
            return await this.dbService.DB_STRUCTURE.getObject<TaskEntity>(`/tasks[${index}]`);
        }
        return null;
    }

}
