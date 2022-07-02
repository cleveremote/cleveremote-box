import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';

/**
 * @JIRA DIGFACT-53464
 * #Recupration des notifications actives pour un CDV
 *
 * Permet la récupération toutes les notifications actives selon le site de l'utilisateur connecté
 *
 * @include NotificationService.getActiveNotifications
 *
*/
export class ActiveNotificationsFetchUC {
    public constructor(private notificationService: TaskService) {}
cleveremote-box/src/modules/task/use-cases/notification-create.spec.ts
    public execute(siteType: string): Promise<NotificationModel[]> {
        return this.notificationService.getActiveNotificationsBySiteType(siteType);
    }
}