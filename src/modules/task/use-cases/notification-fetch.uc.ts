import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';

/**
 * @JIRA DIGFACT-53464
 * #Recuperation d'une notification via son id
 *
 * Permet la récupération d'une notification à partir de son id.
 *
 * @include NotificationService.getNotification
 *
*/
export class NotificationFetchUC {
    public constructor(private notificationService: TaskService) {}

    public execute(id: string): Promise<NotificationModel> {
        return this.notificationService.getNotification(id);
    }
}