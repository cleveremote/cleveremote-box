import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { Authentication, AuthenticationDocument } from '../schemas/authentication.schema';
import { AuthenticationMapper } from '../schemas/mappers/authentication.mapper';

@Injectable()
export class AuthenticationRepository {

    public constructor(
        @InjectModel(Authentication.name) private authenticationModel: Model<AuthenticationDocument>
    ) { }

    public async get(): Promise<AuthenticationModel> {
        const authentication = await this.authenticationModel.findOne();
        return authentication ? AuthenticationMapper.mapToModel(authentication) : new AuthenticationModel();
    }

    public async update(entity: AuthenticationModel): Promise<AuthenticationModel> {
        const saved = await this.authenticationModel.findOneAndUpdate(
            {},
            AuthenticationMapper.mapToSchema(entity),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return AuthenticationMapper.mapToModel(saved);
    }

}
