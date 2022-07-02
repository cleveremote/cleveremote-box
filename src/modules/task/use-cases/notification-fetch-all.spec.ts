import { MockClass } from '@framework/utils/test.utils';
import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';
import { NotificationFetchAllUC } from './notification-fetch-all.uc';

describe('Fetch all notifications use-case tests', () => {
    it('Should return list of notification', async () => {
        //GIVEN
        const notificationService = MockClass(TaskService);
        jest.spyOn(notificationService, 'getAllNotifications')
            .mockImplementation((): Promise<NotificationModel[]> =>
                Promise.resolve([new NotificationModel(), new NotificationModel()]))

        //WHEN
        const uc = new NotificationFetchAllUC(notificationService);
        const result = await uc.execute();

        //THEN
        expect(result).toEqual(
            expect.arrayContaining([expect.any(NotificationModel)])
        );
        expect(result.length).toBe(2);
        expect(notificationService.getAllNotifications).toHaveBeenCalledTimes(1);
    });
});
