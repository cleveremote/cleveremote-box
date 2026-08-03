import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SunBehavior, SunBehaviorSchema } from './sun-behavior.schema';

@Schema({ _id: false })
export class Cron {
    @Prop()
    public date?: Date;

    @Prop()
    public pattern?: string;

    @Prop({ type: SunBehaviorSchema })
    public sunBehavior?: SunBehavior;
}
export const CronSchema = SchemaFactory.createForClass(Cron);
