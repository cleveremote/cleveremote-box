import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Language } from '@framework/i18n/language';

export class EventQueryDTO {

    @IsString()
    @IsNotEmpty()
    @ApiProperty()
    public deviceId: string;

    @IsDateString()
    @IsNotEmpty()
    @ApiProperty()
    public startDate: string;

    @IsDateString()
    @IsNotEmpty()
    @ApiProperty()
    public endDate: string;

    @IsOptional()
    @IsEnum(Language)
    @ApiProperty({ description: 'Langue des messages du journal (défaut : langue de la box)', enum: Language, required: false })
    public lang?: Language;

}
