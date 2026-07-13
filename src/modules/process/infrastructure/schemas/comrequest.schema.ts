import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';

@Schema()
export class ComRequestParams {
    @Prop()
    public length?: number;

    @Prop()
    public scale?: number;

    @Prop()
    public unit?: string;

    @Prop()
    public value?: number;
}
export const ComRequestParamsSchema = SchemaFactory.createForClass(ComRequestParams);

export type ComRequestDocument = ComRequest & Document;

@Schema({ collection: 'comrequests', timestamps: true })
export class ComRequest {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public connectionId: string;

    @Prop({ required: true })
    public function: string;

    @Prop({ required: true })
    public label: string;

    @Prop({ type: String, enum: ComRequestType, required: true })
    public type: ComRequestType;

    @Prop({ required: true })
    public address: number;

    @Prop({ type: ComRequestParamsSchema })
    public params: ComRequestParams;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const ComRequestSchema = SchemaFactory.createForClass(ComRequest);
