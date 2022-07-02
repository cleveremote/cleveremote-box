import { NotificationModel } from 'src/modules/task/domain/models/notification.model';

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

    public static mapToNotificationModel(notificationEntity: NotificationEntity): NotificationModel {
        return {
            id: notificationEntity.id,
            title: notificationEntity.title,
            description: notificationEntity.description,
            startDate: notificationEntity.startDate,
            endDate: notificationEntity.endDate,
            notificationScope: notificationEntity.notificationScope.split(','),
            login: notificationEntity.login,
            createdAt: notificationEntity.createdAt,
            updatedAt: notificationEntity.updatedAt,
            isResolved: notificationEntity.isResolved,
            updatedBy: notificationEntity.updatedBy
        };
    }

    public static mapToNotificationEntity(notification: NotificationModel): NotificationEntity {
        return {
            id: notification.id,
            title: notification.title,
            description: notification.description,
            startDate: notification.startDate,
            endDate: notification.endDate,
            notificationScope: notification.notificationScope.join(','),
            login: notification.login,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt,
            isResolved: notification.isResolved,
            updatedBy: notification.updatedBy
        };
    }
}
