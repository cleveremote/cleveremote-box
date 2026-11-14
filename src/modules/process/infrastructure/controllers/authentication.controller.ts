import { Controller, UseFilters, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RpcErrorsFilter, RpcValidationExceptionFactory } from '@framework/errors/rpc-errors';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationCheckUC } from '@process/use-cases/authentication-check.uc';
import { VerificationCodeCheckUC, VerificationCodeSendUC } from '@process/use-cases/verification-code.uc';
import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { AuthenticationResultModel } from '@process/domain/models/authentication-result.model';
import { VerificationCodeCheckDTO, VerificationCodeSendDTO } from '../dto/verification-code.dto';

// validation au niveau des seuls payloads DTO : box/check/login reçoit un AuthenticationModel brut
const DtoValidationPipe = new ValidationPipe({ transform: true, exceptionFactory: RpcValidationExceptionFactory });

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

    // { login, email? } : email absent = email du compte. status VERIFICATION_CODE_SENT + codeExpiresAt si envoyé
    @MessagePattern(['box/send/verificationcode'])
    public async sendVerificationCode(@Payload(DtoValidationPipe) dto: VerificationCodeSendDTO): Promise<AuthenticationResultModel> {
        const uc = new VerificationCodeSendUC(this._AuthenticationService);
        return await uc.execute(VerificationCodeSendDTO.mapToModel(dto));
    }

    // { login, code } : status VERIFICATION_CODE_VALID si correct (code consommé), sinon INVALID / EXPIRED / TOO_MANY_ATTEMPTS
    @MessagePattern(['box/check/verificationcode'])
    public async checkVerificationCode(@Payload(DtoValidationPipe) dto: VerificationCodeCheckDTO): Promise<AuthenticationResultModel> {
        const uc = new VerificationCodeCheckUC(this._AuthenticationService);
        return await uc.execute(VerificationCodeCheckDTO.mapToModel(dto));
    }

    @MessagePattern(['box/check/connection'])
    public async checkConnection(): Promise<boolean> {
        return true;
    }
}
