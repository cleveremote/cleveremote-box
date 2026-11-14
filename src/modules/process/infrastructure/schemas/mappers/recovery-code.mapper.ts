import { RecoveryCodeModel } from '@process/domain/models/recovery-code.model';
import { RecoveryCodeDocument } from '../recovery-code.schema';

export class RecoveryCodeMapper {

    public static mapToModel(recoveryCode: RecoveryCodeDocument): RecoveryCodeModel {
        const model = new RecoveryCodeModel();
        model.id = recoveryCode._id;
        model.login = recoveryCode.login;
        model.code = recoveryCode.code;
        model.expiresAt = recoveryCode.expiresAt;
        model.attempts = recoveryCode.attempts ?? 0;
        return model;
    }

}
