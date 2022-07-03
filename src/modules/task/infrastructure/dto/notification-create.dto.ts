import { ApiProperty } from '@nestjs/swagger';
import { ExecutionModel } from 'src/modules/task/domain/models/execution.model';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';


export enum USER_ENS_TYPE {
    CA = '499',
    CS = '993',
    CM = '400'
}
export class NotificationCreateDTO {

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
    @IsEnum(USER_ENS_TYPE, { each: true })
    @ApiProperty()
    public notificationScope: USER_ENS_TYPE[];

    @IsNotEmpty()
    @ApiProperty({ required: false, description: 'En cas d\'un incident, cette valeur permettra de connaitre si elle est résolue ou pas.' })
    public isResolved: boolean;

    public static mapToNotificationModel(notificationCreateDTO: NotificationCreateDTO): ExecutionModel {
         const notification = new ExecutionModel();
        // notification.title = notificationCreateDTO.title;
        // notification.description = notificationCreateDTO.description;
        // notification.startDate = new Date(notificationCreateDTO.startDate);
        // notification.endDate = new Date(notificationCreateDTO.endDate);
        // notification.notificationScope = notificationCreateDTO.notificationScope;
        // notification.isResolved = notificationCreateDTO.isResolved;
        return notification;
    }
}

