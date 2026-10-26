import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { RegisterOperationParams, RegisterOperationValue } from '@register-map/domain/models/register-map.model';

export type DeviceCommandDocument = DeviceCommand & Document;

@Schema({ collection: 'devicecommands', timestamps: true })
export class DeviceCommand {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    // modèle (SlaveTemplate) propriétaire, partagé par ses slaves
    @Prop({ required: true, index: true })
    public modelId: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description?: string;

    @Prop({ required: true })
    public blockId: string;

    @Prop({ required: true })
    public operationId: string;

    @Prop({ type: Number, default: undefined })
    public channel?: number;

    // nombre, tableau ou champs composite selon operation.input
    @Prop({ type: Object, default: undefined })
    public value?: RegisterOperationValue;

    @Prop({ type: Boolean, default: undefined })
    public isPersistent?: boolean;

    @Prop({ type: Boolean, default: undefined })
    public isConfirmed?: boolean;

    // usages cumulables (set, read, init, reset)
    @Prop({ type: [{ type: String, enum: Object.values(DeviceCommandType) }], required: true })
    public types: DeviceCommandType[];

    // lecture à champs : champs retenus (absent = tous)
    @Prop({ type: [String], default: undefined })
    public fields?: string[];

    // typage de la voie et de la valeur (cf. RegisterOperationParams), calculé depuis la register map
    @Prop({ type: Object, default: undefined })
    public params?: RegisterOperationParams;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const DeviceCommandSchema = SchemaFactory.createForClass(DeviceCommand);
