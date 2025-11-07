import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationCheckUC } from '@process/use-cases/authentication-check.uc';
import { AuthenticationModel } from '@process/domain/models/authentication.model';

@Controller()
export class AuthenticationController {

    public constructor(
        private _AuthenticationService: AuthenticationService) {
    }

    @MessagePattern(['box/check/login'])
    public async checkLogin(@Payload() authenticationDto: AuthenticationModel): Promise<boolean> {
        const uc = new AuthenticationCheckUC(this._AuthenticationService);
        return await uc.execute(authenticationDto);
    }

    @MessagePattern(['box/check/connection'])
    public async checkConnection(): Promise<boolean> { 
        return true; 
    }
}