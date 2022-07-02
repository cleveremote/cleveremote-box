import { MockClass } from '@framework/utils/test.utils';
import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';
import { NotificationUpdateUC } from './notification-update.uc';

describe('Notification update use-case tests', () => {

    it('Should return the update notification', async () => {

        //GIVEN
        const notificationService = MockClass(TaskService)
        jest.spyOn(notificationService, 'updateNotification')
            .mockImplementation((_id: string, notification: NotificationModel): Promise<NotificationModel> => Promise.resolve(notification));
        const notificationModel = new NotificationModel();
        const id = '1';

        // WHEN
        const uc = new NotificationUpdateUC(notificationService);
        const result = await uc.execute(id, notificationModel);

        //THEN
        expect(result).toBe(notificationModel);
        expect(notificationService.updateNotification).toHaveBeenCalledWith(id, notificationModel);
        expect(notificationService.updateNotification).toHaveBeenCalledTimes(1);
    });
});
