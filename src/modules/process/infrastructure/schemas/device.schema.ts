import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DeviceType, DeviceKind, MasterProtocol } from '@process/domain/models/device.model';

@Schema({ _id: false })
export class DeviceConfig {
    // MASTER
    @Prop({ enum: MasterProtocol })
    public protocol?: MasterProtocol;

    @Prop()
    public ipAddress?: string;

    @Prop()
    public port?: number;

    @Prop()
    public baudRate?: number;

    @Prop()
    public path?: string;

    @Prop()
    public timeout?: number;

    @Prop({ type: [Number] })
    public discoveryRegisters?: number[];

    // SLAVE
    @Prop()
    public slaveId?: number;

    @Prop()
    public masterDeviceId?: string;
}
export const DeviceConfigSchema = SchemaFactory.createForClass(DeviceConfig);

export type DeviceDocument = Device & Document;

@Schema({ collection: 'devices', timestamps: true })
export class Device {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public name: string;

    @Prop({ required: true, enum: DeviceType })
    public type: DeviceType;

    @Prop({ enum: DeviceKind })
    public kind?: DeviceKind;

    @Prop()
    public description: string;

    @Prop({ type: DeviceConfigSchema, required: true })
    public config: DeviceConfig;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const DeviceSchema = SchemaFactory.createForClass(Device);
