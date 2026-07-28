import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ElementType } from '@process/domain/models/event.model';
import { ConditionSymbolEnd, ConditionSymbolStart } from '@process/domain/models/condition.model';

@Schema()
export class Condition {
    @Prop({ required: true })
    public name: string;

    @Prop({ required: true })
    public elementId: string;

    @Prop({ required: true ,enum: ElementType})
    public elementType: ElementType;

    @Prop({ required: true })
    public operator: string;

    @Prop({ type: Object, required: true })
    public value: string | number;

    @Prop({ type: Number })
    public order: number;

    @Prop({ enum: ConditionSymbolStart })
    public symbolStart?: ConditionSymbolStart;

    @Prop({ enum: ConditionSymbolEnd })
    public symbolEnd?: ConditionSymbolEnd;
}
export const ConditionSchema = SchemaFactory.createForClass(Condition);
