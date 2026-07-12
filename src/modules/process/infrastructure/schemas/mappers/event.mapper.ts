import { EventModel } from '@process/domain/models/event.model';
import { Event, EventDocument } from '../event.schema';

export class EventMapper {

    public static mapToModel(event: EventDocument): EventModel {
        const model = new EventModel();
        model._id = event._id.toString();
        model.elementId = event.elementId;
        model.date = event.date;
        model.elementType = event.elementType;
        model.additionalData = event.additionalData;
        model.createdAt = (event as unknown as { createdAt?: Date }).createdAt;
        return model;
    }

    public static mapToSchema(model: EventModel): Event {
        const event = new Event();
        event.elementId = model.elementId;
        event.date = model.date;
        event.elementType = model.elementType;
        event.additionalData = model.additionalData;
        return event;
    }

}
