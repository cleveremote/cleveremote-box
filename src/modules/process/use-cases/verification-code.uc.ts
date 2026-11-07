import { VerificationCodeCheckModel, VerificationCodeSendModel } from '@process/domain/models/authentication.model';
import { AuthenticationResultModel } from '@process/domain/models/authentication-result.model';
import { AuthenticationService } from '@process/domain/services/authentication.service';

/**
 * # Envoi d'un code de vérification
 *
 * Génère un code à usage unique, le stocke haché et l'envoie par mail (email fourni, sinon email du compte).
 *
 * @include AuthenticationService.sendVerificationCode
 *
*/
export class VerificationCodeSendUC {
    public constructor(private _authenticationService: AuthenticationService) { }

    public execute(data: VerificationCodeSendModel): Promise<AuthenticationResultModel> {
        return this._authenticationService.sendVerificationCode(data);
    }
}

/**
 * # Vérification d'un code de vérification
 *
 * Compare le code saisi au code envoyé ; un code valide est consommé.
 *
 * @include AuthenticationService.checkVerificationCode
 *
*/
export class VerificationCodeCheckUC {
    public constructor(private _authenticationService: AuthenticationService) { }

    public execute(data: VerificationCodeCheckModel): Promise<AuthenticationResultModel> {
        return this._authenticationService.checkVerificationCode(data);
    }
}
