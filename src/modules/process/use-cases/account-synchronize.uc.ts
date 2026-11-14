import { AccountSynchronizeModel } from '@process/domain/models/authentication.model';
import { AccountSynchronizeResultModel } from '@process/domain/models/authentication-result.model';
import { AuthenticationService } from '@process/domain/services/authentication.service';

/**
 * # Synchronisation du compte d'authentification
 *
 * Vérifie le mot de passe actuel puis met à jour le mot de passe (haché) et/ou l'email de récupération
 * du compte identifié par son login.
 *
 * @include AuthenticationService.synchronizeAccount
 *
*/
export class AccountSynchronizeUC {
    public constructor(private _authenticationService: AuthenticationService) { }

    public execute(account: AccountSynchronizeModel): Promise<AccountSynchronizeResultModel> {
        return this._authenticationService.synchronizeAccount(account);
    }
}
