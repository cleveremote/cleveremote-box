import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { forcastDataName } from '@process/domain/models/sensor.model';
import { CycleStyle, CycleStyleSchema } from './style.schema';

@Schema({ _id: false })
export class SensorConfig {
    // requis pour FORCAST/COM, absent pour les sensors enfants (parentId renseigne)
    @Prop()
    public cronPattern?: string;

    // FORCAST
    @Prop({ enum: forcastDataName })
    public forcastData?: forcastDataName;

    // COM
    @Prop()
    public comRequestId?: string;

    // CHILD COM (sensor avec parentId)
    @Prop()
    public code?: number;

    @Prop()
    public scale?: number;

    @Prop()
    public unit?: string;
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

    // relation auto-referencee vers le sensor parent (device MASTER_COM)
    @Prop({ type: String, default: null, index: true })
    public parentId: string | null;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const SensorSchema = SchemaFactory.createForClass(Sensor);
