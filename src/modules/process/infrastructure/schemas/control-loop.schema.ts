import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ControlAlgorithm, ControlLoopMode } from '@process/domain/models/control-loop.model';

@Schema({ _id: false })
export class ControlLoopParams {
    @Prop({ default: 5 })
    public kP: number;

    @Prop({ default: 0 })
    public kI: number;

    @Prop({ default: 0 })
    public kD: number;

    @Prop({ default: 1 })
    public tolerance: number;

    @Prop({ default: 20 })
    public maxIterations: number;

    @Prop({ default: 500 })
    public iterationDelayMs: number;
}
export const ControlLoopParamsSchema = SchemaFactory.createForClass(ControlLoopParams);

@Schema({ _id: false })
export class ControlLoopFollow {
    @Prop({ default: 0 })
    public inputMin: number;

    @Prop({ default: 100 })
    public inputMax: number;

    @Prop({ default: 1 })
    public deadband: number;
}
export const ControlLoopFollowSchema = SchemaFactory.createForClass(ControlLoopFollow);

export type ControlLoopDocument = ControlLoop & Document;

@Schema({ collection: 'control_loops', timestamps: true })
export class ControlLoop {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public name: string;

    @Prop({ required: true, index: true })
    public actuatorId: string;

    @Prop({ required: true })
    public sensorId: string;

    @Prop({ type: String, required: true, enum: ControlLoopMode, default: ControlLoopMode.REGULATION })
    public mode: ControlLoopMode;

    @Prop({ type: String, required: true, enum: ControlAlgorithm, default: ControlAlgorithm.P })
    public algorithm: ControlAlgorithm;

    @Prop({ required: true, default: 0 })
    public setpoint: number;

    @Prop({ type: ControlLoopParamsSchema, default: () => ({}) })
    public params: ControlLoopParams;

    @Prop({ type: ControlLoopFollowSchema, default: () => ({}) })
    public follow: ControlLoopFollow;

    @Prop({ type: Boolean, default: true })
    public isEnabled: boolean;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const ControlLoopSchema = SchemaFactory.createForClass(ControlLoop);
