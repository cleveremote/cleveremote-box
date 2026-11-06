import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RpcErrorsFilter } from '@framework/errors/rpc-errors';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationCheckUC } from '@process/use-cases/authentication-check.uc';
import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { AuthenticationResultModel } from '@process/domain/models/authentication-result.model';

@Controller()
@UseFilters(new RpcErrorsFilter())
export class AuthenticationController {

    public constructor(
        private _AuthenticationService: AuthenticationService) {
    }

    @MessagePattern(['box/check/login'])
    // status : logique côté front ; message : texte traduit à afficher tel quel
    public async checkLogin(@Payload() authenticationDto: AuthenticationModel): Promise<AuthenticationResultModel> {
        const uc = new AuthenticationCheckUC(this._AuthenticationService);
        return await uc.execute(authenticationDto);
    }

    @MessagePattern(['box/check/connection'])
    public async checkConnection(): Promise<boolean> {
        return true;
    }
}