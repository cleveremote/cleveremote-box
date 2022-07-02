import { MockClass } from '@framework/utils/test.utils';
import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
import { TaskService } from 'src/modules/task/domain/services/notification.service';
import { ActiveNotificationsFetchUC } from './active-notifications-fetch.uc';

describe('Fetch all notifications use-case tests', () => {
    it('Should return list of notification', async () => {
        //GIVEN
        const notificationService = MockClass(TaskService);
        jest.spyOn(notificationService, 'getActiveNotificationsBySiteType')
            .mockImplementation((): Promise<NotificationModel[]> =>
                Promise.resolve([new NotificationModel(), new NotificationModel()]))

        //WHEN
        const site = '993'
        const uc = new ActiveNotificationsFetchUC(notificationService);
        const result = await uc.execute(site);

        //THEN
        expect(result).toEqual(
            expect.arrayContaining([expect.any(NotificationModel)])
        );
        expect(result.length).toBe(2);
        expect(notificationService.getActiveNotificationsBySiteType).toHaveBeenCalledTimes(1);
    });
});
