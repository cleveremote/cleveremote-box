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

    // deletedAt est géré par cleveremote-updater (soft delete) : un utilisateur supprimé est ignoré
    public async findByLogin(login: string): Promise<AuthenticationModel | null> {
        const authentication = await this.authenticationModel.findOne({ login, deletedAt: null });
        return authentication ? AuthenticationMapper.mapToModel(authentication) : null;
    }

    // password : hash bcrypt
    public async updatePasswordByLogin(login: string, password: string): Promise<boolean> {
        const result = await this.authenticationModel.updateOne(
            { login, deletedAt: null },
            { $set: { password, failedAttempts: 0, lockedUntil: null } }
        );
        return result.modifiedCount > 0 || result.matchedCount > 0;
    }

    // atomique : renvoie le nombre d'échecs consécutifs après incrément
    public async incrementFailedAttempts(id: string): Promise<number> {
        const updated = await this.authenticationModel.findOneAndUpdate({ _id: id }, { $inc: { failedAttempts: 1 } }, { new: true });
        return updated?.failedAttempts ?? 0;
    }

    public async setLockedUntil(id: string, lockedUntil: Date | null): Promise<void> {
        await this.authenticationModel.updateOne({ _id: id }, { $set: { lockedUntil } });
    }

    public async resetFailedAttempts(id: string): Promise<void> {
        await this.authenticationModel.updateOne({ _id: id }, { $set: { failedAttempts: 0, lockedUntil: null } });
    }

    // password : hash bcrypt ; champ undefined = inchangé. Un nouveau mot de passe lève le verrou.
    // null : login inconnu (pas de création : l'identité est vérifiée sur le compte existant)
    public async synchronizeByLogin(login: string, password?: string, email?: string): Promise<AuthenticationModel | null> {
        const $set: Partial<Authentication> = {};
        if (password !== undefined) {
            Object.assign($set, { password, failedAttempts: 0, lockedUntil: null });
        }
        if (email) {
            $set.email = email;
        }
        const saved = await this.authenticationModel.findOneAndUpdate(
            { login, deletedAt: null },
            Object.keys($set).length ? { $set } : {},
            { new: true }
        );
        return saved ? AuthenticationMapper.mapToModel(saved) : null;
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
