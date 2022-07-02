import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';

/**
 * @JIRA DIGFACT-53464
 * # Sauvegarde d'une notification
 *
 * Permet la creation d'une nouvelle notitification
 *
 * @include NotificationService.saveNotification
 *
*/
export class NotificationCreateUC {
    public constructor(private notificationService: TaskService) {}

    public execute(notification: NotificationModel): Promise<NotificationModel> {
        return this.notificationService.saveNotification(notification);
    }
}