import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { Condition, ConditionSchema } from './condition.schema';

@Schema()
export class CustomTask {
    @Prop({ required: true })
    public taskId: string;

    @Prop({ type: String, default: null })
    public param: string | null;
}
export const CustomTaskSchema = SchemaFactory.createForClass(CustomTask);

@Schema({ _id: false })
export class ModuleTimingConfig {
    @Prop({ default: 0 })
    public waitBeforeExec: number;

    @Prop({ default: 0 })
    public waitAfterExec: number;

    @Prop({ default: 0 })
    public waitBeforeExecOff: number;

    @Prop({ default: 0 })
    public waitAfterExecOff: number;
}
export const ModuleTimingConfigSchema = SchemaFactory.createForClass(ModuleTimingConfig);

@Schema({ _id: false })
export class SequenceModuleConfig {
    @Prop({ type: String, ref: 'ActuatorRpi', required: true })
    public moduleId: string;

    @Prop({ type: ModuleTimingConfigSchema, default: () => ({}) })
    public configTiming: ModuleTimingConfig;

    @Prop({ type: Number, default: undefined })
    public customValue?: number;
}
export const SequenceModuleConfigSchema = SchemaFactory.createForClass(SequenceModuleConfig);

@Schema({ _id: false })
export class SecurityConfig {
    @Prop({ required: true })
    public maxDuration: number;

    // default: undefined desactive le comportement par defaut de Mongoose qui persiste
    // systematiquement un tableau vide [] pour les champs de type array meme si absents.
    @Prop({ type: [ConditionSchema], default: undefined })
    public conditions?: Condition[];

    @Prop({ type: [CustomTaskSchema], default: undefined })
    public customStack?: CustomTask[];
}
export const SecurityConfigSchema = SchemaFactory.createForClass(SecurityConfig);

export type SequenceDocument = Sequence & Document;

@Schema({ collection: 'sequences', timestamps: true })
export class Sequence {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ type: String, ref: 'Cycle', required: true })
    public cycleId: string;

    @Prop({ required: true })
    public name: string;

    @Prop()
    public description: string;

    @Prop({ required: true, enum: ExecutableStatus, default: ExecutableStatus.STOPPED })
    public status: ExecutableStatus;

    // determine l'ordre d'execution des sequences d'un meme cycle (croissant)
    @Prop({ default: 0 })
    public order: number;

    @Prop({ type: SecurityConfigSchema, required: true })
    public securityConfig: SecurityConfig;

    @Prop({ type: [SequenceModuleConfigSchema], default: [] })
    public moduleConfigs: SequenceModuleConfig[];

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}
export const SequenceSchema = SchemaFactory.createForClass(Sequence);
