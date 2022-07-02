import { TaskService } from 'src/modules/task/domain/services/notification.service';

/**
 * @JIRA DIGFACT-53464
 *
 * # Suppression d'une notification
 * Permet la suppression d'une notification à partir de son id.
 *
 * @include NotificationService.deleteNotification
 *
*/
export class NotificationDeleteUC {
    public constructor(private notificationService: TaskService) {}

    public execute(id: string): Promise<boolean> {
        return this.notificationService.deleteNotification(id);
    }
}