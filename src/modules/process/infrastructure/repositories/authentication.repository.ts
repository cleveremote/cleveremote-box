/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
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