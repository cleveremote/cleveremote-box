import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ComActuatorAction, DigitalPortType } from '@process/domain/models/actuator.model';

@Schema({ _id: false })
export class ComActuatorActionConfig {
    @Prop({ required: true })
    public comRequestId: string;

    @Prop({ required: true, enum: ComActuatorAction })
    public action: ComActuatorAction;

    @Prop({ required: true })
    public digitalPort: number;

    @Prop({ required: true, enum: DigitalPortType })
    public type: DigitalPortType;
}
export const ComActuatorActionConfigSchema = SchemaFactory.createForClass(ComActuatorActionConfig);

@Schema({ _id: false })
export class RpiActuatorConfig {
    @Prop({ required: true })
    public rpiPin: number;

    @Prop({ required: true, enum: GPIODirection })
    public direction: GPIODirection;

    @Prop({ required: true, enum: GPIOEdge })
    public edge: GPIOEdge;

    @Prop({ default: false })
    public activeLow?: boolean;

    @Prop({ default: true })
    public reconfigureDirection?: boolean;

    @Prop({ default: 0 })
    public debounceTimeout?: number;
}
export const RpiActuatorConfigSchema = SchemaFactory.createForClass(RpiActuatorConfig);

@Schema({ _id: false })
export class ComActuatorConfig {
    @Prop({ required: true })
    public deviceId: string;

    @Prop({ type: [ComActuatorActionConfigSchema], default: [] })
    public actions: ComActuatorActionConfig[];
}
export const ComActuatorConfigSchema = SchemaFactory.createForClass(ComActuatorConfig);

@Schema({ _id: false })
export class CtrlActuatorConfig {
    @Prop()
    public deviceId?: string;

    @Prop()
    public channel?: number;

    @Prop()
    public flowMeterId?: string;

    @Prop({ default: 100 })
    public maxFlowRate?: number;

    @Prop({ default: 5 })
    public kP?: number;

    @Prop({ default: 0 })
    public minOpening?: number;

    @Prop({ default: 100 })
    public maxOpening?: number;

    @Prop({ default: 0 })
    public openingPercent?: number;

    @Prop({ default: 1 })
    public tolerance?: number;

    @Prop({ default: 20 })
    public maxIterations?: number;

    @Prop({ default: 500 })
    public iterationDelayMs?: number;

    @Prop({ default: 'PROPORTIONAL' })
    public valveType?: string;
}
export const CtrlActuatorConfigSchema = SchemaFactory.createForClass(CtrlActuatorConfig);

export type ActuatorDocument = Actuator & Document & {
    config?: RpiActuatorConfig | ComActuatorConfig | CtrlActuatorConfig;
};

// discriminatorKey: 'type' reutilise le champ `type` (RPI/COM/CTRL) deja stocke en base par les
// donnees existantes/migrees (cf ActuatorMongooseRepository.migrateLegacyCollections) : pas de
// migration necessaire pour activer les discriminators Mongoose sur les box deja deployees.
@Schema({ collection: 'actuators', timestamps: true, discriminatorKey: 'type' })
export class Actuator {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true, enum: ActuatorType })
    public type: ActuatorType;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description?: string;

    @Prop({ required: true, enum: ModuleStatus, default: ModuleStatus.OFF })
    public status: ModuleStatus;

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const ActuatorSchema = SchemaFactory.createForClass(Actuator);

// pas d'`extends Actuator` ici : SchemaFactory.createForClass reappliquerait les @Prop herites
// (dont `type`, notre discriminatorKey), ce que Mongoose refuse explicitement sur un schema de
// discriminator ("Discriminator ... cannot have field with name ..."). Chaque classe ne declare
// donc que son propre delta (`config`) ; les champs de base sont fusionnes par Mongoose a l'usage.
@Schema()
export class ActuatorRpi {
    @Prop({ type: RpiActuatorConfigSchema, required: true })
    public config: RpiActuatorConfig;
}
export const ActuatorRpiSchema = SchemaFactory.createForClass(ActuatorRpi);
export type ActuatorRpiDocument = Actuator & ActuatorRpi & Document;

@Schema()
export class ActuatorCom {
    @Prop({ type: ComActuatorConfigSchema, required: true })
    public config: ComActuatorConfig;
}
export const ActuatorComSchema = SchemaFactory.createForClass(ActuatorCom);
export type ActuatorComDocument = Actuator & ActuatorCom & Document;

@Schema()
export class ActuatorCtrl {
    @Prop({ type: CtrlActuatorConfigSchema, required: true })
    public config: CtrlActuatorConfig;
}
export const ActuatorCtrlSchema = SchemaFactory.createForClass(ActuatorCtrl);
export type ActuatorCtrlDocument = Actuator & ActuatorCtrl & Document;
