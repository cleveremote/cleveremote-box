/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { ForbiddenException } from '@nestjs/common';
import { IStructureRepository } from 'src/modules/task/domain/interfaces/structure-repository.interface';
import { CycleModel } from '../../domain/models/cycle.model';
import { ModuleModel } from '../../domain/models/module.model';
import { SequenceModel } from '../../domain/models/sequence.model';
import { StructureModel } from '../../domain/models/structure.model';
import { NotificationEntity } from '../entities/notification.entity';


export class NotificationRepository implements IStructureRepository {
   async getCycles(): Promise<CycleModel[]> {
        throw new Error('Method not implemented.');
    }
    async getSequences(): Promise<SequenceModel[]> {
        throw new Error('Method not implemented.');
    }
    async getModules(): Promise<ModuleModel[]> {
        
        throw new Error('Method not implemented.');
    }
    async getCycle(id: string): Promise<CycleModel> {
        throw new Error('Method not implemented.');
    }
    async getSequence(id: string): Promise<SequenceModel> {
        throw new Error('Method not implemented.');
    }
    async getModule(id: string): Promise<ModuleModel> {
        throw new Error('Method not implemented.');
    }
    async savecStructure(structure: StructureModel): Promise<StructureModel> {
        throw new Error('Method not implemented.');
    }

    // async getAllCycles(): Promise<NotificationModel[]> {
    //     const result = await new Promise(()=>{});
    //     return Promise.resolve((result as any).map(notification => NotificationEntity.mapToNotificationModel(notification)));
    // }

    // async getAllSequences(id: string): Promise<NotificationModel> {
    //     const result = await new Promise(()=>{});
    //     return Promise.resolve((result as any).map(notification => NotificationEntity.mapToNotificationModel(notification)));
    // }

    // async getActiveNotifications(siteType: string): Promise<NotificationModel[]> {
    //     const result = await new Promise(()=>{});
    //     return Promise.resolve((result as any).map(notification => NotificationEntity.mapToNotificationModel(notification)));
    // }

    // async saveNotification(notification: NotificationModel): Promise<NotificationModel> {
    //     const result = await new Promise(()=>{});
    //     return Promise.resolve((result as any).map(notification => NotificationEntity.mapToNotificationModel(notification)));
    // }
    // async updateNotification(id: string, notification: NotificationModel): Promise<NotificationModel> {
    //     const result = await new Promise(()=>{});
    //     return Promise.resolve((result as any).map(notification => NotificationEntity.mapToNotificationModel(notification)));
    // }

    // async deleteNotification(id: string): Promise<boolean> {
       
    //     return Promise.resolve(true);
    // }

}