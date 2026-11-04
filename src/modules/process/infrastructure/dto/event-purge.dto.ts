import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { ISO_WITH_OFFSET, ISO_WITH_OFFSET_MESSAGE } from './iso-date.util';

export class EventPurgeDTO {

    // cycle (ses sequences comprises), capteur ou tout autre element ; absent = purge globale
    @IsString()
    @IsOptional()
    @ApiProperty({ required: false })
    public deviceId?: string;

    // ne supprime que les events anterieurs a cette date ; absent = tous
    @IsDateString()
    @Matches(ISO_WITH_OFFSET, { message: ISO_WITH_OFFSET_MESSAGE })
    @IsOptional()
    @ApiProperty({ required: false })
    public before?: string;

}
