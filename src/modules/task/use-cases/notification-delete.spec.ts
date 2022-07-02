import { MockClass } from '@framework/utils/test.utils';
import { TaskService } from 'src/modules/task/domain/services/notification.service';
import { NotificationRepository } from 'src/modules/task/infrastructure/repositories/notification.repository';
import { NotificationDeleteUC } from './notification-delete.uc';

describe('Notification deletion use-case tests', () => {
    const notificationRepository = MockClass(NotificationRepository);
    const notificationService = new TaskService(notificationRepository);
    it('Should return true when notification is deleted', async () => {
        //GIVEN
        const id = '12';

        jest.spyOn(notificationService, 'deleteNotification').mockImplementation((): Promise<boolean> => {
            return Promise.resolve(true);
        });

        //WHEN
        const uc = new NotificationDeleteUC(notificationService);
        const isDeleted = await uc.execute(id);

        //THEN
        expect(isDeleted).toBe(true);
        expect(notificationService.deleteNotification).toHaveBeenCalledTimes(1);
        expect(notificationService.deleteNotification).toHaveBeenCalledWith(id);
    });
});
