import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { AccountSynchronizeModel } from '@process/domain/models/authentication.model';

export class AccountSynchronizeDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Login du compte (numero de serie de la box)' })
    public login: string;

    // confirme l'identité : vérifié (bcrypt + verrou progressif) avant toute mise à jour
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Mot de passe actuel en clair, requis pour confirmer l\'identite' })
    public password: string;

    // en clair : haché (bcrypt) par la box avant écriture en BD
    @IsOptional()
    @IsString()
    @MinLength(8)
    @ApiProperty({ description: 'Nouveau mot de passe en clair (absent = inchange)', required: false })
    public newPassword?: string;

    // absent ou null = email actuel conservé (pas de suppression possible)
    @IsOptional()
    @IsEmail()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @ApiProperty({ description: 'Email de recuperation (absent ou null = inchange)', required: false, nullable: true })
    public email?: string | null;

    public static mapToAccountModel(dto: AccountSynchronizeDTO): AccountSynchronizeModel {
        const model = new AccountSynchronizeModel();
        model.login = dto.login.trim();
        model.password = dto.password;
        model.newPassword = dto.newPassword;
        model.email = dto.email ?? undefined;
        return model;
    }
}
