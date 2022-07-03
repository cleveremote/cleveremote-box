
// import { Endpoint } from '@framework/decorator/endpoint.decorator';
// import { User, UserModel } from '@framework/decorator/user.decorator';
import { Body, Controller, HttpException, Param, UnauthorizedException } from '@nestjs/common';
import { ExecutionService } from 'src/modules/task/domain/services/execution.service';
import { ActiveNotificationsFetchUC } from 'src/modules/task/use-cases/active-notifications-fetch.uc';
import { NotificationCreateUC } from 'src/modules/task/use-cases/notification-create.uc';
import { NotificationDeleteUC } from 'src/modules/task/use-cases/notification-delete.uc';
import { NotificationFetchAllUC } from 'src/modules/task/use-cases/notification-fetch-all.uc';
import { NotificationFetchUC } from 'src/modules/task/use-cases/notification-fetch.uc';
import { NotificationUpdateUC } from 'src/modules/task/use-cases/notification-update.uc';
import { NotificationCreateDTO } from '../dto/notification-create.dto';
import { NotificationResponseVendorDTO } from '../dto/notification-response-vendor.dto';
import { NotificationResponseDTO } from '../dto/notification-response.dto';


@Controller('espace-vente/notifications')
export class NotificationController {

    public constructor(private notificationService: ExecutionService) { }

    // // @Endpoint({
    // //     method: 'GET',
    // //     path: '/',
    // //     domain: 'notification',
    // //     response: {
    // //         200: {
    // //             description: 'Liste de toutes les notifications',
    // //             type: [NotificationResponseDTO]
    // //         },
    // //         403: {
    // //             description: 'Accès non autorisé.',
    // //             type: UnauthorizedException
    // //         }
    // //     },
    // //     usertypes: ['CDV']
    // // })
    // public async getAllNotification(): Promise<NotificationResponseDTO[]> {
    //     const notificationFetchAllUC = new NotificationFetchAllUC(this.notificationService);
    //     const data = await notificationFetchAllUC.execute();
    //     return data.map(notification => NotificationResponseDTO.mapToNotificationResponseDTO(notification));
    // }

    // // @Endpoint({
    // //     method: 'GET',
    // //     path: '/:id',
    // //     domain: 'notification',
    // //     params: [{ name: 'id', type: String }],
    // //     response: {
    // //         200: {
    // //             description: 'Notification par son identifiant',
    // //             type: NotificationResponseDTO
    // //         },
    // //         403: {
    // //             description: 'Accès non autorisé.',
    // //             type: UnauthorizedException
    // //         }
    // //     },
    // //     usertypes: ['CDV']
    // // })
    // public async getNotification(@Param('id') id: string): Promise<NotificationResponseDTO> {
    //     const notificationFetchUC = new NotificationFetchUC(this.notificationService);
    //     return NotificationResponseDTO.mapToNotificationResponseDTO(await notificationFetchUC.execute(id));
    // }
    // // eslint-disable-next-line max-lines-per-function
    // // @Endpoint({
    // //     method: 'POST',
    // //     path: '/',
    // //     domain: 'notification',
    // //     response: {
    // //         500: {
    // //             description: 'Erreur - Création d\'une notification',
    // //             type: HttpException
    // //         },
    // //         201: {
    // //             description: 'Création d\'une nouvelle notification',
    // //             type: NotificationResponseDTO
    // //         },
    // //         200: {
    // //             description: 'Création d\'une nouvelle notification',
    // //             type: NotificationResponseDTO
    // //         },
    // //         403: {
    // //             description: 'Accès non autorisé.',
    // //             type: UnauthorizedException
    // //         }
    // //     },
    // //     usertypes: ['CDV']
    // // })
    // // eslint-disable-next-line max-len
    // public async createNotification(@Body() notificationDTO: NotificationCreateDTO, @User() user: UserModel): Promise<NotificationResponseDTO> {
    //     const notificationCreateUC = new NotificationCreateUC(this.notificationService);
    //     const notification = NotificationCreateDTO.mapToNotificationModel(notificationDTO);
    //     notification.login = user.agentId;
    //     return NotificationResponseDTO.mapToNotificationResponseDTO(await notificationCreateUC.execute(notification));
    // }

    // // eslint-disable-next-line max-lines-per-function
    // // @Endpoint({
    // //     method: 'PUT',
    // //     path: '/:id',
    // //     domain: 'notification',
    // //     response: {
    // //         500: {
    // //             description: 'Erreur - Modification d\'une notification',
    // //             type: HttpException
    // //         },
    // //         201: {
    // //             description: 'Modification d\'une notification',
    // //             type: NotificationResponseDTO
    // //         },
    // //         200: {
    // //             description: 'Modification d\'une notification',
    // //             type: NotificationResponseDTO
    // //         },
    // //         403: {
    // //             description: 'Accès non autorisé.',
    // //             type: UnauthorizedException
    // //         }
    // //     },
    // //     usertypes: ['CDV']
    // // })
    // // eslint-disable-next-line max-len
    // public async updateNotification(@Param('id') id: string, @Body() notificationDTO: NotificationCreateDTO, @User() user: UserModel): Promise<NotificationResponseDTO> {
    //     const notificationUpdate = new NotificationUpdateUC(this.notificationService);
    //     const notification = NotificationCreateDTO.mapToNotificationModel(notificationDTO);
    //     notification.updatedBy = user.agentId;
    //     return NotificationResponseDTO.mapToNotificationResponseDTO(await notificationUpdate.execute(id, notification));
    // }

    // // @Endpoint({
    // //     method: 'DELETE',
    // //     path: '/:id',
    // //     params: [{ name: 'id', type: String }],
    // //     domain: 'notification',
    // //     response: {
    // //         200: {
    // //             description: 'Notification correctement supprimée',
    // //             type: Boolean
    // //         },
    // //         403: {
    // //             description: 'Accès non autorisé.',
    // //             type: UnauthorizedException
    // //         }
    // //     },
    // //     usertypes: ['CDV']
    // // })
    // public deleteNotification(@Param('id') id: string): Promise<boolean>  {
    //     const notificationDelete = new NotificationDeleteUC(this.notificationService);
    //     return notificationDelete.execute(id);
    // }

    // // @Endpoint({
    // //     method: 'GET',
    // //     path: '/active',
    // //     domain: 'notification',
    // //     response: {
    // //         200: {
    // //             description: 'Liste de toutes les notifications',
    // //             type: [NotificationResponseVendorDTO]
    // //         },
    // //         403: {
    // //             description: 'Accès non authorisé.',
    // //             type: UnauthorizedException
    // //         }
    // //     },
    // //     usertypes: ['CDV']
    // // })
    // // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    // public async getActiveNotifications(@User() user: UserModel): Promise<NotificationResponseVendorDTO[]> {
    //     const activeNotification = new ActiveNotificationsFetchUC(this.notificationService);
    //     const data = await activeNotification.execute(user.site);
    //     return data.map(notification => NotificationResponseVendorDTO.mapToNotificationResponseVendorDTO(notification));
    // }
}

