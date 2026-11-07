import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VerificationCodeCheckModel, VerificationCodeSendModel } from '@process/domain/models/authentication.model';

// box/send/verificationcode
export class VerificationCodeSendDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Login du compte (numero de serie de la box)' })
    public login: string;

    // absent = email du compte ; renseigné = adresse à valider (ex. nouvel email avant box/synchronize/account)
    @IsOptional()
    @IsEmail()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @ApiProperty({ description: 'Adresse de destination du code (absent = email du compte)', required: false })
    public email?: string;

    public static mapToModel(dto: VerificationCodeSendDTO): VerificationCodeSendModel {
        const model = new VerificationCodeSendModel();
        model.login = dto.login.trim();
        model.email = dto.email ?? undefined;
        return model;
    }
}

// box/check/verificationcode
export class VerificationCodeCheckDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Login du compte (numero de serie de la box)' })
    public login: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Code de verification recu par mail' })
    public code: string;

    public static mapToModel(dto: VerificationCodeCheckDTO): VerificationCodeCheckModel {
        const model = new VerificationCodeCheckModel();
        model.login = dto.login.trim();
        model.code = dto.code;
        return model;
    }
}
