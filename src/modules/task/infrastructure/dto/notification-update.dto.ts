import { ApiProperty } from '@nestjs/swagger';
import { ExecutionModel } from 'src/modules/task/domain/models/execution.model';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { USER_ENS_TYPE } from './notification-create.dto';

export class NotificationUpdateDTO {

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
    @IsEnum(USER_ENS_TYPE, { each: true })
    @ApiProperty()
    public notificationScope: USER_ENS_TYPE[];

    @IsNotEmpty()
    @ApiProperty({ required: false, name: 'En cas d\'un incident, cette valeur permettra de connaitre si elle est résolue ou pas.' })
    public isResolved: boolean;

    public static mapToNotificationModel(notificationUpdateDTO: NotificationUpdateDTO): ExecutionModel {
        const notification = new ExecutionModel();
        return notification;
    }
}


