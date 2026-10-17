import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ElementType } from '@process/domain/models/event.model';
import { ConditionConnector, ConditionOperator, ConditionParentType } from '@process/domain/models/condition.model';

@Schema({ _id: false })
export class Condition {
    @Prop({ required: true })
    public elementId: string;

    @Prop({ required: true, enum: ElementType })
    public elementType: ElementType;

    @Prop({ required: true, enum: ConditionOperator })
    public operator: ConditionOperator;

    @Prop({ type: Object, required: true })
    public value: string | number;

    @Prop({ type: Number })
    public order: number;

    @Prop({ enum: ConditionConnector })
    public connector?: ConditionConnector;

    // string libre : les anciennes donnees peuvent contenir 'not' / 'and' / 'or' (normalisees au mapping)
    @Prop({ type: String })
    public symbolStart?: string;

    @Prop({ type: String })
    public symbolEnd?: string;

    @Prop()
    public parentId?: string;

    @Prop({ enum: ConditionParentType })
    public parentType?: ConditionParentType;
}
export const ConditionSchema = SchemaFactory.createForClass(Condition);
