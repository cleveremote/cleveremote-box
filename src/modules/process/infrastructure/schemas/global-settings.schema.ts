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

// cles = valeurs de ProcessMode (cf. ModeRanksModel)
@Schema({ _id: false })
export class ModeRanks {
    @Prop({ required: true })
    public MANUAL: number;

    @Prop({ required: true })
    public SCHEDULE: number;

    @Prop({ required: true })
    public TRIGGER: number;
}
export const ModeRanksSchema = SchemaFactory.createForClass(ModeRanks);

@Schema({ collection: 'globalsettings', timestamps: true })
export class GlobalSettings {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ type: LocalCoordinatesSchema })
    public localCoordinates?: LocalCoordinates;

    @Prop({ type: ModeRanksSchema })
    public modeRanks?: ModeRanks;

    @Prop({ type: String })
    public language?: string;
}
export const GlobalSettingsSchema = SchemaFactory.createForClass(GlobalSettings);
