import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class IconColor {
    @Prop({ required: true })
    public icon: string;

    @Prop({ required: true })
    public base: string;
}
export const IconColorSchema = SchemaFactory.createForClass(IconColor);

@Schema()
export class CycleStyle {
    @Prop({ required: true })
    public bgColor: string;

    @Prop({ required: true })
    public fontColor: string;

    @Prop({ type: IconColorSchema, required: true })
    public iconColor: IconColor;
}
export const CycleStyleSchema = SchemaFactory.createForClass(CycleStyle);
