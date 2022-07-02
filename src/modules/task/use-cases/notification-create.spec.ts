import { MockClass } from '@framework/utils/test.utils';
import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';
import { NotificationCreateUC } from './notification-create.uc';

describe('Notification creation use case tests', () => {
    it('Should return a Notification Model id when it\'s created', async () => {
        //GIVEN
        const notificationService = MockClass(TaskService);
        jest.spyOn(notificationService, 'saveNotification')
            .mockImplementation((notification: NotificationModel): Promise<NotificationModel> => Promise.resolve(notification));

        const notificationModel = new NotificationModel();

        // WHEN
        const uc = new NotificationCreateUC(notificationService);
        const result = await uc.execute(notificationModel);

        //THEN
        expect(result).toBe(notificationModel);
        expect(notificationService.saveNotification).toHaveBeenCalledWith(notificationModel);
        expect(notificationService.saveNotification).toHaveBeenCalledTimes(1);
    });
});
