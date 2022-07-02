import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';


/**
 * @JIRA DIGFACT-53464
 * #Mise à jour d'une notification
 *
 * Permet la modification d'une notitification existante
 *
 * @include NotificationService.saveNotification
 *
*/
export class NotificationUpdateUC {
    public constructor(private notificationService: TaskService) {}

    public execute(id: string, notification: NotificationModel): Promise<NotificationModel> {
        return this.notificationService.updateNotification(id, notification);
    }
}
