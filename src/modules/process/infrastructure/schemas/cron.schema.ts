import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SunBehavior, SunBehaviorSchema } from './sun-behavior.schema';

@Schema()
export class Cron {
    @Prop()
    public date?: Date;

    @Prop()
    public pattern?: string;

    @Prop({ type: SunBehaviorSchema })
    public sunBehavior?: SunBehavior;

    @Prop()
    public after?: number;
}
export const CronSchema = SchemaFactory.createForClass(Cron);
