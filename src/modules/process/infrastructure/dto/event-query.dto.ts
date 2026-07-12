import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

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

}
