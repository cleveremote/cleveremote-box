import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';

/**
 * @JIRA DIGFACT-53464
 * #Recuperation de toutes les notifications
 *
 * Permet la récupération toutes les notifications disponibles.
 *
 * @include NotificationService.getAllNotifications
 *
*/
export class NotificationFetchAllUC {
    public constructor(private notificationService: TaskService) {}

    public execute(): Promise<NotificationModel[]> {
        return this.notificationService.getAllNotifications();
    }
}