import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecoveryCodeModel } from '@process/domain/models/recovery-code.model';
import { VerificationCode, VerificationCodeDocument } from '../schemas/verification-code.schema';

// même forme que RecoveryCodeRepository (code à usage unique haché) sur la collection verification_codes
@Injectable()
export class VerificationCodeRepository {

    public constructor(
        @InjectModel(VerificationCode.name) private verificationCodeModel: Model<VerificationCodeDocument>
    ) { }

    public async getByLogin(login: string): Promise<RecoveryCodeModel | null> {
        const verificationCode = await this.verificationCodeModel.findOne({ login });
        return verificationCode ? this._mapToModel(verificationCode) : null;
    }

    public async upsert(login: string, code: string, expiresAt: Date): Promise<RecoveryCodeModel> {
        const saved = await this.verificationCodeModel.findOneAndUpdate(
            { login },
            { login, code, expiresAt, attempts: 0 },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return this._mapToModel(saved);
    }

    // atomique : renvoie le nombre d'essais échoués après incrément
    public async incrementAttempts(login: string): Promise<number> {
        const updated = await this.verificationCodeModel.findOneAndUpdate({ login }, { $inc: { attempts: 1 } }, { new: true });
        return updated?.attempts ?? 0;
    }

    public async deleteByLogin(login: string): Promise<void> {
        await this.verificationCodeModel.deleteOne({ login });
    }

    private _mapToModel(verificationCode: VerificationCodeDocument): RecoveryCodeModel {
        const model = new RecoveryCodeModel();
        model.id = verificationCode._id;
        model.login = verificationCode.login;
        model.code = verificationCode.code;
        model.expiresAt = verificationCode.expiresAt;
        model.attempts = verificationCode.attempts ?? 0;
        return model;
    }

}
