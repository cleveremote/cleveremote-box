import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { ISO_WITH_OFFSET, ISO_WITH_OFFSET_MESSAGE } from './iso-date.util';
import { Language } from '@framework/i18n/language';

export class EventQueryDTO {

    // absent : runs de tous les cycles
    @IsString()
    @IsOptional()
    @ApiProperty({ required: false })
    public deviceId?: string;

    // startDate / endDate : toutes les deux ou aucune (aucune = les 50 derniers runs / events)
    @ValidateIf((dto: EventQueryDTO) => !!dto.startDate || !!dto.endDate)
    @IsDateString()
    @Matches(ISO_WITH_OFFSET, { message: ISO_WITH_OFFSET_MESSAGE })
    @IsNotEmpty()
    @ApiProperty({ required: false, description: 'Obligatoire si endDate est renseignée' })
    public startDate?: string;

    @ValidateIf((dto: EventQueryDTO) => !!dto.startDate || !!dto.endDate)
    @IsDateString()
    @Matches(ISO_WITH_OFFSET, { message: ISO_WITH_OFFSET_MESSAGE })
    @IsNotEmpty()
    @ApiProperty({ required: false, description: 'Obligatoire si startDate est renseignée' })
    public endDate?: string;

    @IsOptional()
    @IsEnum(Language)
    @ApiProperty({ description: 'Langue des messages du journal (défaut : langue de la box)', enum: Language, required: false })
    public lang?: Language;

}
