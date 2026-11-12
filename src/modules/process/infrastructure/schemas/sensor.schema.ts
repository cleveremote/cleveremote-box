import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { AnalogSignalType, forcastDataName } from '@process/domain/models/sensor.model';
import { OutOfRangePolicy } from '@process/domain/utils/linear-scale.util';
import { CycleStyle, CycleStyleSchema } from './style.schema';

// ANALOG : mise à l'échelle de la valeur brute lue vers la grandeur physique (cf. AnalogScalingModel)
@Schema({ _id: false })
export class AnalogScaling {
    @Prop({ required: true, enum: AnalogSignalType })
    public signalType: AnalogSignalType;

    @Prop({ required: true })
    public inputMin: number;

    @Prop({ required: true })
    public inputMax: number;

    @Prop({ required: true })
    public outputMin: number;

    @Prop({ required: true })
    public outputMax: number;

    @Prop({ required: true })
    public unit: string;

    @Prop({ enum: OutOfRangePolicy, default: OutOfRangePolicy.CLAMP })
    public outOfRange: OutOfRangePolicy;
}
export const AnalogScalingSchema = SchemaFactory.createForClass(AnalogScaling);

@Schema({ _id: false })
export class SensorConfig {
    // requis pour FORCAST/COM, absent pour les sensors enfants (parentId renseigne)
    @Prop()
    public cronPattern?: string;

    // FORCAST
    @Prop({ enum: forcastDataName })
    public forcastData?: forcastDataName;

    // COM : DeviceCommand (register map)
    @Prop()
    public commandId?: string;

    // COM : slave sur lequel la commande est lue
    @Prop()
    public deviceId?: string;

    // nom du champ decode a retenir (racine ou enfant)
    @Prop()
    public field?: string;

    // ANALOG (racine ou enfant)
    @Prop({ type: AnalogScalingSchema })
    public scaling?: AnalogScaling;
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

    @Prop({ type: Boolean, default: true })
    public isEnabled: boolean;

    @Prop({ type: Boolean, default: true })
    public display: boolean;

    // relation auto-referencee vers le sensor parent (device MASTER_COM)
    @Prop({ type: String, default: null, index: true })
    public parentId: string | null;

    // fixe a la creation (cf. SensorMapper.mapToSchema) : absent des mises a jour, donc conserve
    @Prop({ type: Boolean, default: false })
    public autoCreated: boolean;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const SensorSchema = SchemaFactory.createForClass(Sensor);
