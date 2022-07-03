import { ExecutionModel } from 'src/modules/task/domain/models/execution.model';

export class NotificationEntity {
   public id: string;

    public title: string;

    public description: string;

    public createdAt: Date;

    public updatedAt: Date;

    public startDate: Date;

    public endDate: Date;

    public login: string;

    public updatedBy: string;

    public notificationScope: string;

    public isResolved: boolean;

    public static mapToNotificationModel(notificationEntity: NotificationEntity): ExecutionModel {
        return null;
    }

    public static mapToNotificationEntity(notification: ExecutionModel): NotificationEntity {
        return null;
    }
}
