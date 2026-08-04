import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class ChildCycleConfig {
    @Prop({ required: true })
    public order: number;

    @Prop({ default: true })
    public waitForCompletion: boolean;

    @Prop({ default: 0 })
    public delayBefore: number;

    @Prop({ default: 0 })
    public delayAfter: number;

    @Prop({ default: false })
    public isSkipped: boolean;
}
export const ChildCycleConfigSchema = SchemaFactory.createForClass(ChildCycleConfig);

@Schema()
export class ChildCycle {
    @Prop({ type: String, ref: 'Cycle', required: true })
    public cycleId: string;

    @Prop({ type: ChildCycleConfigSchema, required: true })
    public config: ChildCycleConfig;
}
export const ChildCycleSchema = SchemaFactory.createForClass(ChildCycle);
