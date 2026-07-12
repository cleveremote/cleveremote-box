import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ExecutableAction } from '@process/domain/interfaces/executable.interface';
import { Condition, ConditionSchema } from './condition.schema';
import { SunBehavior, SunBehaviorSchema } from './sun-behavior.schema';

@Schema()
export class TriggerCondition {
    @Prop()
    public timeAfter: number;

    @Prop({ type: SunBehaviorSchema })
    public sunBehavior: SunBehavior;
}
export const TriggerConditionSchema = SchemaFactory.createForClass(TriggerCondition);

export type TriggerDocument = Trigger & Document;

@Schema({ collection: 'triggers', timestamps: true })
export class Trigger {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ type: String, ref: 'Cycle', required: true })
    public cycleId: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description: string;

    @Prop({ type: [ConditionSchema], default: [] })
    public conditions: Condition[];

    @Prop({ type: TriggerConditionSchema, required: true })
    public trigger: TriggerCondition;

    @Prop({ default: 0 })
    public delay: number;

    @Prop({ default: false })
    public shouldConfirmation: boolean;

    @Prop()
    public duration?: number;

    @Prop()
    public lastTriggeredAt: Date;

    @Prop({ default: false })
    public isPaused: boolean;

    @Prop({ required: true, enum: ExecutableAction })
    public action: ExecutableAction;

    @Prop({ default: false })
    public isCheckInProgress: boolean;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const TriggerSchema = SchemaFactory.createForClass(Trigger);
