import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecoveryCodeModel } from '@process/domain/models/recovery-code.model';
import { RecoveryCode, RecoveryCodeDocument } from '../schemas/recovery-code.schema';
import { RecoveryCodeMapper } from '../schemas/mappers/recovery-code.mapper';

@Injectable()
export class RecoveryCodeRepository {

    public constructor(
        @InjectModel(RecoveryCode.name) private recoveryCodeModel: Model<RecoveryCodeDocument>
    ) { }

    public async getByLogin(login: string): Promise<RecoveryCodeModel | null> {
        const recoveryCode = await this.recoveryCodeModel.findOne({ login });
        return recoveryCode ? RecoveryCodeMapper.mapToModel(recoveryCode) : null;
    }

    public async upsert(login: string, code: string, expiresAt: Date): Promise<RecoveryCodeModel> {
        const saved = await this.recoveryCodeModel.findOneAndUpdate(
            { login },
            { login, code, expiresAt, attempts: 0 },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return RecoveryCodeMapper.mapToModel(saved);
    }

    // atomique : renvoie le nombre d'essais échoués après incrément
    public async incrementAttempts(login: string): Promise<number> {
        const updated = await this.recoveryCodeModel.findOneAndUpdate({ login }, { $inc: { attempts: 1 } }, { new: true });
        return updated?.attempts ?? 0;
    }

    public async deleteByLogin(login: string): Promise<void> {
        await this.recoveryCodeModel.deleteOne({ login });
    }

}
