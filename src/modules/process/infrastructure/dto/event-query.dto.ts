import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { ISO_WITH_OFFSET, ISO_WITH_OFFSET_MESSAGE } from './iso-date.util';
import { Language } from '@framework/i18n/language';
import { RunOutcome } from '@process/domain/models/cycle-history.model';

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

    // etat des runs (cycle / tous cycles) ; absent ou vide = tous les etats. Ignore pour un capteur / une sequence
    @IsOptional()
    @IsArray()
    @IsEnum(RunOutcome, { each: true })
    @ApiProperty({ description: 'Filtre sur l\'etat des runs (absent ou vide = tous)', enum: RunOutcome, isArray: true, required: false })
    public outcomes?: RunOutcome[];

    // nombre max de runs / events renvoyes ; absent : 50 sans periode, pas de limite avec une periode
    @IsOptional()
    @IsInt()
    @Min(1)
    @ApiProperty({ description: 'Nombre max de runs renvoyes (defaut : 50 sans periode)', required: false })
    public limit?: number;

    @IsOptional()
    @IsEnum(Language)
    @ApiProperty({ description: 'Langue des messages du journal (défaut : langue de la box)', enum: Language, required: false })
    public lang?: Language;

}
