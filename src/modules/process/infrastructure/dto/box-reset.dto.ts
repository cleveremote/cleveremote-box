import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BoxResetModel } from '@process/domain/models/authentication.model';

// box/reset/account
export class BoxResetDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Login du compte (numero de serie de la box)' })
    public login: string;

    // confirme l'identité : vérifié (bcrypt + verrou progressif) avant toute suppression
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Mot de passe actuel en clair, requis pour confirmer l\'identite' })
    public password: string;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'Reset hard du compte : identifiants d\'usine restaures (absent = false)', required: false })
    public account?: boolean;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'Reset hard de toute la BD hormis le compte, puis redemarrage (absent = false)', required: false })
    public data?: boolean;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Identifiant de la box ciblee', required: false })
    public boxId?: string;

    public static mapToModel(dto: BoxResetDTO): BoxResetModel {
        const model = new BoxResetModel();
        model.login = dto.login.trim();
        model.password = dto.password;
        model.account = dto.account === true;
        model.data = dto.data === true;
        model.boxId = dto.boxId;
        return model;
    }
}
