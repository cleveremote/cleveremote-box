//import { UserTypeGuard } from '@framework/guards/usertype.guard';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ExecutionService } from 'src/modules/task/domain/services/execution.service';
import { NotificationController } from './controllers/notification.controller';
import { NotificationRepository } from './repositories/notification.repository';


@Module({
    imports: [
        NotificationRepository
    ],
    controllers: [NotificationController],
    providers: [
        {
            inject: [NotificationRepository],
            provide: ExecutionService,
            useFactory: (notificationRepository): ExecutionService => new ExecutionService(notificationRepository)
        },
        NotificationRepository
        // {
        //     provide: APP_GUARD,
        //     useClass: UserTypeGuard
        // }
    ]
})
export class NotificationModule {}