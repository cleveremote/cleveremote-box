import { MockClass } from '@framework/utils/test.utils';
import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';
import { NotificationFetchUC } from './notification-fetch.uc';

describe('Fetch a specific notification use-case tests', () => {
    it('Should return notification when id', async () => {
        //GIVEN
        const notificationService = MockClass(TaskService);
        const notificationModel1 = new NotificationModel();
        notificationModel1.id = '1';
        const notificationModel2 = new NotificationModel();
        notificationModel2.id = '2';
        const notificationModel3 = new NotificationModel();
        notificationModel3.id = '3';

        const listNotif = [notificationModel1, notificationModel2, notificationModel3];

        jest.spyOn(notificationService, 'getNotification')
            .mockImplementation((id: string): Promise<NotificationModel> => {
                return Promise.resolve(listNotif.find(notif => id === notif.id));
            });


        // WHEN
        const Id = '2';
        const uc = new NotificationFetchUC(notificationService);
        const result = await uc.execute(Id);

        //THEN
        expect(result).toBe(notificationModel2);
        expect(notificationService.getNotification).toHaveBeenCalledWith(Id);
        expect(notificationService.getNotification).toHaveBeenCalledTimes(1);
    });
});
