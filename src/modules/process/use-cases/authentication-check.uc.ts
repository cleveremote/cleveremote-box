import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class AuthenticationCheckUC {
    public constructor(private _authenticationService: AuthenticationService) { }

    public execute(data: AuthenticationModel): Promise<boolean> {
        return this._authenticationService.checkPassword(data);
    }
}