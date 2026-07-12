import { Injectable } from '@nestjs/common';
import { EventModel } from '@process/domain/models/event.model';
import { EventMongooseRepository } from './event-mongoose.repository';

@Injectable()
export class EventRepository {

    public constructor(private eventMongooseRepository: EventMongooseRepository) { }

    public async save(model: EventModel): Promise<EventModel> {
        return this.eventMongooseRepository.create(model);
    }

    public async getByDeviceAndDateRange(elementId: string, startDate: Date, endDate: Date): Promise<EventModel[]> {
        return this.eventMongooseRepository.findByDeviceAndDateRange(elementId, startDate, endDate);
    }

    public async getLast(elementId: string): Promise<EventModel> {
        return this.eventMongooseRepository.findLastByDevice(elementId);
    }

}
