import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class EventPurgeDTO {

    // cycle (ses sequences comprises), capteur ou tout autre element ; absent = purge globale
    @IsString()
    @IsOptional()
    @ApiProperty({ required: false })
    public deviceId?: string;

    // ne supprime que les events anterieurs a cette date ; absent = tous
    @IsDateString()
    @IsOptional()
    @ApiProperty({ required: false })
    public before?: string;

}
