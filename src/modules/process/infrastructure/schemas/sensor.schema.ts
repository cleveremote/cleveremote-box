import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { forcastDataName } from '@process/domain/models/sensor.model';
import { CycleStyle, CycleStyleSchema } from './style.schema';

@Schema({ _id: false })
export class SensorConfig {
    @Prop({ required: true })
    public cronPattern: string;

    // FORCAST
    @Prop({ enum: forcastDataName })
    public forcastData?: forcastDataName;

    // COM
    @Prop()
    public comRequestId?: string;
}
export const SensorConfigSchema = SchemaFactory.createForClass(SensorConfig);

export type SensorDocument = Sensor & Document;

@Schema({ collection: 'sensors', timestamps: true })
export class Sensor {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description: string;

    @Prop({ type: CycleStyleSchema })
    public style: CycleStyle;

    @Prop({ required: true, enum: SensorType })
    public type: SensorType;

    @Prop({ type: SensorConfigSchema, required: true })
    public config: SensorConfig;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const SensorSchema = SchemaFactory.createForClass(Sensor);
