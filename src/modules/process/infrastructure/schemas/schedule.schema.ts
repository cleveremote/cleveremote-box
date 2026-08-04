import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Cron, CronSchema } from './cron.schema';

export type ScheduleDocument = Schedule & Document;

@Schema({ collection: 'schedules', timestamps: true })
export class Schedule {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ type: String, ref: 'Cycle', required: true })
    public cycleId: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description: string;

    @Prop({ type: CronSchema, required: true })
    public cron: Cron;

    @Prop({ default: false })
    public isPaused: boolean;

    @Prop({ default: false })
    public shouldConfirmation: boolean;

    @Prop()
    public duration?: number;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const ScheduleSchema = SchemaFactory.createForClass(Schedule);
