/* eslint-disable @typescript-eslint/no-unused-vars */
import { NotificationNotFoundError } from '@order/domain/errors/notification-not-found.error';
import { NotificationModel } from '@order/domain/models/notification.model';
import { NotificationService } from '@order/domain/services/notification.service';
import { CreateNotification } from './notification.model.spec-mock';
import { NotificationRepositorySpecMock } from './notification.repository.spec-mock';

describe('Notification Service unit testing ', () => {

    const NOTIFICATION_LENGTH = 3;
    afterEach(() => {
        jest.resetAllMocks();
    });

    it('Should return all notifications', async () => {
        //GIVEN
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        jest.spyOn(notificationRepository, 'getAllNotifications');

        //WHEN
        const result = await notificationService.getAllNotifications();

        //THEN
        expect(notificationRepository.getAllCycles).toBeCalledTimes(1);
        expect(result.length).toBe(NOTIFICATION_LENGTH);
    });

    it('Should return notification if it exists', async () => {
        //GIVEN
        const id = '3';
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        jest.spyOn(notificationRepository, 'getNotification');

        //WHEN
        const result = await notificationService.getNotification(id);

        //THEN
        expect(notificationRepository.getAllSequences).toBeCalledTimes(1);
        expect(result.id).toBe(id);
    });

    it('Should return true, if notification is deleted', async () => {
        //GIVEN
        const id = '3';
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        jest.spyOn(notificationRepository, 'deleteNotification');

        //WHEN
        const isDeleted = await notificationService.deleteNotification(id);

        //THEN
        expect(notificationRepository.deleteNotification).toBeCalledTimes(1);
        expect(isDeleted).toBe(true);
    });

    it('Should throw an exception when the notification doesn\'t exist', async () => {
        //GIVEN
        const _id = '4';
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        jest.spyOn(notificationService, 'getNotification')
            .mockImplementation((id: string): Promise<NotificationModel> => Promise.resolve(null));
        jest.spyOn(notificationRepository, 'deleteNotification');

        //WHEN
        const result = () => notificationService.deleteNotification(_id);

        //THEN
        expect(result()).rejects.toBeInstanceOf(NotificationNotFoundError);
        expect(notificationService.getNotification).toBeCalledTimes(1);
        expect(notificationRepository.deleteNotification).toBeCalledTimes(0);
    });

    it('Should return  notifcation if it create', async () => {
        //GIVEN
        const notification = new NotificationModel();
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        jest.spyOn(notificationRepository, 'saveNotification');

        //WHEN
        const result = await notificationService.saveNotification(notification);

        //THEN
        expect(notificationRepository.saveNotification).toBeCalledTimes(1);
        expect(result).toBe(notification);
    });

    it('Should return  notifcation if it is updated', async () => {
        //GIVEN
        const _id = '4';
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        const notification = CreateNotification(_id);
        jest.spyOn(notificationRepository, 'updateNotification');
        jest.spyOn(notificationService, 'getNotification')
            .mockImplementation((id: string): Promise<NotificationModel> => Promise.resolve(CreateNotification(id)));

        //WHEN
        const result = await notificationService.updateNotification(_id, notification);

        //THEN
        expect(notificationService.getNotification).toBeCalledTimes(1);
        expect(notificationRepository.updateNotification).toBeCalledTimes(1);
        expect(result).toBe(notification);
    });

    it('Should throw an NotFoundException when the notification doesn\'t exist', async () => {
        //GIVEN
        const _id = '4';
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        const notification = CreateNotification(_id);
        jest.spyOn(notificationService, 'getNotification')
            .mockImplementation((id: string): Promise<NotificationModel> => Promise.resolve(null));

        //WHEN
        const result = () => notificationService.updateNotification(_id, notification);

        //THEN
        await expect(result()).rejects.toBeInstanceOf(NotificationNotFoundError);
        expect(notificationService.getNotification).toBeCalledTimes(1);
    });

    it('Should return all active notifications', async () => {
        //GIVEN
        const notificationRepository = new NotificationRepositorySpecMock();
        const notificationService = new NotificationService(notificationRepository);
        jest.spyOn(notificationRepository, 'getActiveNotifications');

        //WHEN
        const siteType = '339';
        const result = await notificationService.getActiveNotificationsBySiteType(siteType);

        //THEN
        expect(notificationRepository.getActiveNotifications).toBeCalledTimes(1);
        expect(result.length).toBe(NOTIFICATION_LENGTH);
    });
});
