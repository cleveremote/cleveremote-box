import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SunState, TimeDirection } from '@process/domain/interfaces/schedule.interface';

@Schema({ _id: false })
export class SunBehavior {
    @Prop({ required: true, enum: SunState })
    public sunState: SunState;
    @Prop({ required: true, enum: TimeDirection })
    public timeDirection: TimeDirection;
    @Prop({ required: true })
    public time: number;
}
export const SunBehaviorSchema = SchemaFactory.createForClass(SunBehavior);
