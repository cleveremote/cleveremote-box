import { ApiProperty } from '@nestjs/swagger';
import { ProcessModel } from '@process/domain/models/process.model';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class NotificationResponseDTO {

    @IsNotEmpty()
    @ApiProperty()
    public id: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public title: string;


    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public description: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public startDate: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public endDate: string;

    @IsNotEmpty()
    @ApiProperty()
    public createdAt: string;

    @IsNotEmpty()
    @ApiProperty()
    public updatedAt: string;

    @IsNotEmpty()
    @IsArray()
    @ApiProperty()
    public notificationScope: string[];

    @IsNotEmpty()
    @ApiProperty()
    public isResolved: boolean;

    public static mapToNotificationResponseDTO(notification: ProcessModel): NotificationResponseDTO {
        const notificationResponseDTO = new NotificationResponseDTO();
        return notificationResponseDTO;
    }
}
