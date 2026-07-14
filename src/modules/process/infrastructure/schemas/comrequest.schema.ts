import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ModbusFunctionName } from '@process/domain/models/com-request.model';

@Schema({ _id: false })
export class ComRequestPersistenceConfig {
    @Prop({ required: true })
    public persist: boolean;

    @Prop({ required: true })
    public address: number;
}
export const ComRequestPersistenceConfigSchema = SchemaFactory.createForClass(ComRequestPersistenceConfig);

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

    @Prop({ type: ComRequestPersistenceConfigSchema })
    public persistence?: ComRequestPersistenceConfig;
}
export const ComRequestParamsSchema = SchemaFactory.createForClass(ComRequestParams);

export type ComRequestDocument = ComRequest & Document;

@Schema({ collection: 'comrequests', timestamps: true })
export class ComRequest {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public deviceId: string;

    @Prop({ type: [String], enum: ModbusFunctionName, required: true })
    public function: ModbusFunctionName[];

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description?: string;

    @Prop({ type: [String], enum: ComRequestType, required: true })
    public type: ComRequestType[];

    @Prop({ required: true })
    public address: number;

    @Prop({ default: false })
    public disabled?: boolean;

    @Prop({ type: ComRequestParamsSchema })
    public params: ComRequestParams;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const ComRequestSchema = SchemaFactory.createForClass(ComRequest);
