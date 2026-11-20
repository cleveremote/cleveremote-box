import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DeviceKind } from '@process/domain/models/device.model';
import { AnalogSignalType } from '@process/domain/models/sensor.model';
import { InverterAnalogSignalType, InverterMode, InverterRole } from '@process/domain/models/inverter.model';

@Schema({ _id: false })
export class InverterParameter {
    @Prop({ required: true })
    public blockId: string;

    @Prop({ required: true })
    public field: string;

    @Prop({ required: true })
    public readCommandId: string;

    @Prop({ required: true })
    public setCommandId: string;

    @Prop({ type: Number, default: undefined })
    public value?: number;

    @Prop({ type: Boolean, default: true })
    public isPersistent: boolean;
}
export const InverterParameterSchema = SchemaFactory.createForClass(InverterParameter);

// caractéristique du capteur d'une entrée analogique (cf. InverterAnalogSensorModel)
@Schema({ _id: false })
export class InverterAnalogSensor {
    @Prop({ type: String, required: true, enum: [AnalogSignalType.VOLTAGE, AnalogSignalType.CURRENT] })
    public signalType: InverterAnalogSignalType;

    @Prop({ type: Number, required: true })
    public inputMin: number;

    @Prop({ type: Number, required: true })
    public inputMax: number;

    @Prop({ type: Number, required: true })
    public outputMin: number;

    @Prop({ type: Number, required: true })
    public outputMax: number;

    @Prop({ type: String, required: true })
    public unit: string;
}
export const InverterAnalogSensorSchema = SchemaFactory.createForClass(InverterAnalogSensor);

@Schema({ _id: false })
export class InverterAnalogInputs {
    @Prop({ type: InverterAnalogSensorSchema, default: undefined })
    public AI1?: InverterAnalogSensor;

    @Prop({ type: InverterAnalogSensorSchema, default: undefined })
    public AI2?: InverterAnalogSensor;
}
export const InverterAnalogInputsSchema = SchemaFactory.createForClass(InverterAnalogInputs);

export type InverterDocument = Inverter & Document;

@Schema({ collection: 'inverters', timestamps: true, minimize: false })
export class Inverter {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description?: string;

    @Prop({ required: true, index: true })
    public deviceId: string;

    @Prop({ type: String, required: true, enum: DeviceKind })
    public profile: DeviceKind;

    // commandId par rôle (InverterRole)
    @Prop({ type: Object, default: () => ({}) })
    public commands: Partial<Record<InverterRole, string>>;

    @Prop({ type: [InverterParameterSchema], default: [] })
    public parameters: InverterParameter[];

    @Prop({ type: InverterAnalogInputsSchema, default: () => ({}) })
    public analogInputs: InverterAnalogInputs;

    @Prop()
    public manualSensorId?: string;

    @Prop({ type: String, enum: InverterMode, default: InverterMode.PID })
    public defaultMode: InverterMode;

    @Prop({ default: 3000 })
    public releaseGraceMs: number;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const InverterSchema = SchemaFactory.createForClass(Inverter);
