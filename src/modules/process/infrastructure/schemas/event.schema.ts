import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ElementType, ProcessEventData, SensorEventData } from '@process/domain/models/event.model';

export type EventDocument = Event & Document;

@Schema({ collection: 'events', timestamps: true })
export class Event {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public elementId: string;

    @Prop({ required: true, type: Date })
    public date: Date;

    @Prop({ enum: ElementType })
    public elementType?: ElementType;

    @Prop({ type: Object, required: true })
    public additionalData: ProcessEventData | SensorEventData;
}

export const EventSchema = SchemaFactory.createForClass(Event);
EventSchema.index({ elementId: 1, date: 1 });
