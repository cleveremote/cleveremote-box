import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DeviceRangeType } from '@process/domain/models/device.model';

export type SlaveTemplateDocument = SlaveTemplate & Document;

@Schema({ collection: 'models', timestamps: true })
export class SlaveTemplate {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description?: string;

    @Prop({ required: true, enum: DeviceRangeType })
    public type: DeviceRangeType;

    // structure libre (cf. SlaveTemplate du domaine) : validée en entrée par SlaveTemplateDTO
    @Prop({ type: SchemaTypes.Mixed, required: true })
    public device: Record<string, unknown>;

    @Prop({ type: [SchemaTypes.Mixed], default: [] })
    public comRequests: Record<string, unknown>[];
}
export const SlaveTemplateSchema = SchemaFactory.createForClass(SlaveTemplate);
