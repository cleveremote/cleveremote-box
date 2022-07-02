import { NotificationModel } from 'src/modules/task/domain/models/notification.model';

export function CreateNotification(id: string): NotificationModel {
    const notification = new NotificationModel();
    notification.id = id;
    return notification;
}