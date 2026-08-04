import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ModbusFunctionName, ModbusValueType } from '@process/domain/models/com-request.model';

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

    @Prop({ type: Object })
    public value?: number | number[];

    @Prop({ type: String, default: undefined })
    public formula?: string | null;

    @Prop({ type: ComRequestPersistenceConfigSchema })
    public persistence?: ComRequestPersistenceConfig;
}
export const ComRequestParamsSchema = SchemaFactory.createForClass(ComRequestParams);

@Schema({ _id: false })
export class ComRequestConfig {
    @Prop({ required: true })
    public address: number;

    @Prop({ type: [String], enum: ModbusFunctionName, default: undefined })
    public function?: ModbusFunctionName[];

    @Prop({ type: Boolean, default: undefined })
    public disabled?: boolean;

    @Prop({ type: Boolean, default: false })
    public done?: boolean;

    @Prop({ type: String, enum: ModbusValueType, default: undefined })
    public type?: ModbusValueType;

    @Prop({ type: ComRequestParamsSchema, default: undefined })
    public params?: ComRequestParams;
}
export const ComRequestConfigSchema = SchemaFactory.createForClass(ComRequestConfig);

export type ComRequestDocument = ComRequest & Document;

@Schema({ collection: 'comrequests', timestamps: true })
export class ComRequest {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public deviceId: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description?: string;

    @Prop({ type: [String], enum: ComRequestType, required: true })
    public type: ComRequestType[];

    @Prop({ type: ComRequestConfigSchema, required: true })
    public config: ComRequestConfig;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const ComRequestSchema = SchemaFactory.createForClass(ComRequest);
