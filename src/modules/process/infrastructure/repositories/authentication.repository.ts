/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CycleEntity } from '../entities/cycle.entity';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ValueEntity } from '../entities/value.entity';
import { ProcessValueEntity } from '../entities/process-value.entity';
import { SensorValueEntity } from '../entities/sensor-value.entity';
import { SensorValueRepository } from './sensor-value.repository';
import { ProcessValueRepository } from './process-value.repository';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';
import { AuthenticationModel } from '@process/domain/models/authentication.model';

@Injectable()
export class AuthenticationRepository {

    public constructor(
        private dbService: DbService
    ) { }

    // eslint-disable-next-line max-len
    public async get(type: string = '/', id?: string): Promise<AuthenticationModel> {
        return await this.dbService.DB_AUTH.getObject<AuthenticationModel>('/');
    }

    public async update(entity: AuthenticationModel): Promise<AuthenticationModel> {
        await this.dbService.DB_AUTH.push(`/login`, entity.login);
        await this.dbService.DB_AUTH.push(`/password`, entity.password);
        this.dbService.executeBackUp('DB_AUTH');
        return await this.dbService.DB_AUTH.getObject<AuthenticationModel>('/');
    }

}