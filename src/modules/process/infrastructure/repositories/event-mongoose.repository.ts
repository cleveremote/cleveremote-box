import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventModel } from '@process/domain/models/event.model';
import { Event, EventDocument } from '../schemas/event.schema';
import { EventMapper } from '../schemas/mappers/event.mapper';

@Injectable()
export class EventMongooseRepository {

    public constructor(@InjectModel(Event.name) private eventModel: Model<EventDocument>) { }

    public async create(model: EventModel): Promise<EventModel> {
        const created = await this.eventModel.create(EventMapper.mapToSchema(model));
        return EventMapper.mapToModel(created);
    }

    public async findByDeviceAndDateRange(elementId: string, startDate: Date, endDate: Date): Promise<EventModel[]> {
        const events = await this.eventModel
            .find({ elementId, date: { $gte: startDate, $lte: endDate } })
            .sort({ date: 1 });
        const t =     events.map(EventMapper.mapToModel);
        return t;
    }

    public async findLastByDevice(elementId: string): Promise<EventModel> {
        const event = await this.eventModel.findOne({ elementId }).sort({ date: -1 });
        return event ? EventMapper.mapToModel(event) : null;
    }

}
