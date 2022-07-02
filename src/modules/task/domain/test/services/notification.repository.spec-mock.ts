import { ITaskRepository } from 'src/modules/task/domain/interfaces/notification-repository.interface';
import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { CreateNotification } from './notification.model.spec-mock';

export class NotificationRepositorySpecMock implements ITaskRepository {

    private _listNotification: NotificationModel [];

    public constructor() {
        this._listNotification = [CreateNotification('1'), CreateNotification('2'), CreateNotification('3')];
    }
    public getAllCycles(): Promise<NotificationModel[]> {
        return Promise.resolve(this._listNotification);
    }
    public getAllSequences(id: string): Promise<NotificationModel> {
        return Promise.resolve(this._listNotification.find(notif => id === notif.id));
    }
    public saveNotification(notification: NotificationModel): Promise<NotificationModel> {
        return Promise.resolve(notification);
    }
    public updateNotification(_id: string, notification: NotificationModel): Promise<NotificationModel> {
        return Promise.resolve(notification);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public deleteNotification(_id: string): Promise<boolean> {
        return  Promise.resolve(true);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getActiveNotifications(_siteType: string): Promise<NotificationModel[]> {
        return Promise.resolve(this._listNotification);
    }
}