import { ApiProperty } from '@nestjs/swagger';
import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
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

    public static mapToNotificationResponseDTO(notification: NotificationModel): NotificationResponseDTO {
        const notificationResponseDTO = new NotificationResponseDTO();
        notificationResponseDTO.id = notification.id;
        notificationResponseDTO.title = notification.title;
        notificationResponseDTO.description = notification.description;
        notificationResponseDTO.startDate = notification.startDate.toString();
        notificationResponseDTO.endDate = notification.endDate.toString();
        notificationResponseDTO.notificationScope = notification.notificationScope;
        notificationResponseDTO.createdAt = notification.createdAt?.toString();
        notificationResponseDTO.updatedAt = notification.updatedAt.toString();
        notificationResponseDTO.isResolved = notification.isResolved;
        return notificationResponseDTO;
    }
}
