import { NotificationModel } from 'src/modules/task/domain/models/notification.model';

describe('NotificationModel model', () => {
    it ('Should create a new notification Model', () => {
        const notifcation = new NotificationModel();
        expect(notifcation).toBeDefined();
    });
});
