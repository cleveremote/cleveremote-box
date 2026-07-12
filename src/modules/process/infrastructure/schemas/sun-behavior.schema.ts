import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SunState } from '@process/domain/interfaces/schedule.interface';

@Schema()
export class SunBehavior {
    @Prop({ required: true, enum: SunState })
    public sunState: SunState;

    @Prop({ required: true })
    public time: number;
}
export const SunBehaviorSchema = SchemaFactory.createForClass(SunBehavior);
