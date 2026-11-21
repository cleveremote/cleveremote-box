import { BoxResetModel } from '@process/domain/models/authentication.model';
import { AuthenticationResultModel } from '@process/domain/models/authentication-result.model';
import { BoxResetService } from '@process/domain/services/box-reset.service';

/**
 * # Réinitialisation hard de la box
 *
 * Après vérification du mot de passe : reset du compte (identifiants d'usine), de toutes les données
 * hormis le compte, ou de la base entière si les deux sont demandés.
 *
 * @include BoxResetService.reset
 *
*/
export class BoxResetUC {
    public constructor(private _boxResetService: BoxResetService) { }

    public execute(request: BoxResetModel): Promise<AuthenticationResultModel> {
        return this._boxResetService.reset(request);
    }
}
