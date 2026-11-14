import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Language } from '@framework/i18n/language';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';

export class LocalCoordinatesDTO {
    @IsNumber()
    @ApiProperty({ description: 'Latitude de la box' })
    public latitude: number;

    @IsNumber()
    @ApiProperty({ description: 'Longitude de la box' })
    public longitude: number;
}

// cles = valeurs de ProcessMode ; le plus petit rang passe en premier
export class ModeRanksDTO {
    @IsNumber()
    @ApiProperty({ description: 'Rang des declenchements manuels' })
    public MANUAL: number;

    @IsNumber()
    @ApiProperty({ description: 'Rang des declenchements par planification' })
    public SCHEDULE: number;

    @IsNumber()
    @ApiProperty({ description: 'Rang des declenchements par trigger' })
    public TRIGGER: number;
}

export class GlobalSettingsSynchronizeDTO {
    @IsOptional()
    @ValidateNested()
    @Type(() => LocalCoordinatesDTO)
    @ApiProperty({ description: 'Coordonnees locales de la box (latitude/longitude)', required: false })
    public localCoordinates?: LocalCoordinatesDTO;

    @IsOptional()
    @ValidateNested()
    @Type(() => ModeRanksDTO)
    @ApiProperty({ description: 'Rang de chaque origine lors d\'un conflit d\'actuator (plus petit = prioritaire)', required: false })
    public modeRanks?: ModeRanksDTO;

    @IsOptional()
    @IsEnum(Language)
    @ApiProperty({ description: 'Langue par defaut des textes de la box (register maps, noms generes)', enum: Language, required: false })
    public language?: Language;

    // champ absent = non modifie (cf. GlobalSettingsMapper.mapToSchema)
    public static mapToGlobalSettingsModel(dto: GlobalSettingsSynchronizeDTO): GlobalSettingsModel {
        const model = new GlobalSettingsModel();
        model.localCoordinates = dto.localCoordinates
            ? { latitude: dto.localCoordinates.latitude, longitude: dto.localCoordinates.longitude }
            : undefined;
        model.modeRanks = dto.modeRanks
            ? { MANUAL: dto.modeRanks.MANUAL, SCHEDULE: dto.modeRanks.SCHEDULE, TRIGGER: dto.modeRanks.TRIGGER }
            : undefined;
        model.language = dto.language;
        return model;
    }
}
