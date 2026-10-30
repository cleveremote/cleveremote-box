import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DeviceType, DeviceKind, MasterProtocol } from '@process/domain/models/device.model';

@Schema({ _id: false })
export class PortConfig {
    @Prop({ required: true })
    public portNumStart: number;

    @Prop({ required: true })
    public portCount: number;
}
export const PortConfigSchema = SchemaFactory.createForClass(PortConfig);

@Schema({ _id: false })
export class DeviceConfig {
    // MASTER
    @Prop({ enum: MasterProtocol })
    public protocol?: MasterProtocol;

    @Prop()
    public ipAddress?: string;

    @Prop()
    public deviceId?: string;

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

    @Prop({ enum: DeviceKind })
    public kind?: DeviceKind;

    // modele (SlaveTemplate) dont le slave partage les DeviceCommand
    @Prop()
    public modelId?: string;

    // DeviceCommand init du modele deja appliquees sur ce slave
    @Prop({ type: [String], default: undefined })
    public initDoneCommandIds?: string[];

    @Prop({ type: PortConfigSchema })
    public portConfig?: PortConfig;
}
export const DeviceConfigSchema = SchemaFactory.createForClass(DeviceConfig);

@Schema({ _id: false })
export class DeviceConnectivity {
    @Prop({ required: true })
    public connected: boolean;

    // date du dernier changement d'etat (connexion ou perte)
    @Prop({ required: true })
    public changedAt: Date;

    @Prop()
    public error?: string;
}
export const DeviceConnectivitySchema = SchemaFactory.createForClass(DeviceConnectivity);

export type DeviceDocument = Device & Document;

@Schema({ collection: 'devices', timestamps: true })
export class Device {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public name: string;

    @Prop({ required: true, enum: DeviceType })
    public type: DeviceType;

    @Prop()
    public description: string;

    @Prop({ type: DeviceConfigSchema, required: true })
    public config: DeviceConfig;

    // ecrit uniquement par updateConnectivity : jamais renseigne par DeviceMapper.mapToSchema,
    // pour qu'un save / upsert de la configuration ne l'ecrase pas
    @Prop({ type: DeviceConnectivitySchema })
    public connectivity?: DeviceConnectivity;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const DeviceSchema = SchemaFactory.createForClass(Device);
