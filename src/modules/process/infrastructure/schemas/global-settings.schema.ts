import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';

export type GlobalSettingsDocument = GlobalSettings & Document;

@Schema({ _id: false })
export class LocalCoordinates {
    @Prop({ required: true })
    public latitude: number;

    @Prop({ required: true })
    public longitude: number;
}
export const LocalCoordinatesSchema = SchemaFactory.createForClass(LocalCoordinates);

@Schema({ collection: 'globalsettings', timestamps: true })
export class GlobalSettings {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ type: LocalCoordinatesSchema })
    public localCoordinates?: LocalCoordinates;
}
export const GlobalSettingsSchema = SchemaFactory.createForClass(GlobalSettings);
