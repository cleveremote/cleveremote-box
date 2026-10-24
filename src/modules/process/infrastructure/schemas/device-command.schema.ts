import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { RegisterOperationValue } from '@register-map/domain/models/register-map.model';

export type DeviceCommandDocument = DeviceCommand & Document;

@Schema({ collection: 'devicecommands', timestamps: true })
export class DeviceCommand {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true, index: true })
    public deviceId: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description?: string;

    @Prop({ required: true })
    public blockId: string;

    @Prop({ required: true })
    public operationId: string;

    @Prop({ type: Number, default: undefined })
    public channel?: number;

    // nombre, tableau ou champs composite selon operation.input
    @Prop({ type: Object, default: undefined })
    public value?: RegisterOperationValue;

    @Prop({ type: Boolean, default: undefined })
    public isPersistent?: boolean;

    @Prop({ type: Boolean, default: undefined })
    public isConfirmed?: boolean;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const DeviceCommandSchema = SchemaFactory.createForClass(DeviceCommand);
