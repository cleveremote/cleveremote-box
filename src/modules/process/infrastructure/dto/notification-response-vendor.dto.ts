import { ApiProperty } from '@nestjs/swagger';
import { ProcessModel } from '@process/domain/models/process.model';
import { IsNotEmpty, IsString } from 'class-validator';

export class NotificationResponseVendorDTO {

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
    public isResolved: boolean;

    public static mapToNotificationResponseVendorDTO(notification: ProcessModel): NotificationResponseVendorDTO {
         const notificationResponseVendorDTO = new NotificationResponseVendorDTO();
        // notificationResponseVendorDTO.id = notification.id;
        // notificationResponseVendorDTO.title = notification.title;
        // notificationResponseVendorDTO.description = notification.description;
        // notificationResponseVendorDTO.startDate = notification.startDate.toString();
        // notificationResponseVendorDTO.endDate = notification.endDate.toString();
        // notificationResponseVendorDTO.isResolved = notification.isResolved;
        return notificationResponseVendorDTO;
    }
}