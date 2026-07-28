import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { CycleType, ExecutableStatus, ExecutionMode, ProcessMode } from '@process/domain/interfaces/executable.interface';
import { Condition, ConditionSchema } from './condition.schema';
import { ChildCycle, ChildCycleSchema } from './child-cycle.schema';
import { CycleStyle, CycleStyleSchema } from './style.schema';

export { CycleType, ExecutionMode };

@Schema()
export class ModePriority { 
    @Prop({ required: true, enum: ProcessMode })
    public mode: ProcessMode;

    @Prop({ required: true })
    public priority: number;
}
export const ModePrioritySchema = SchemaFactory.createForClass(ModePriority);

export type CycleDocument = Cycle & Document;

@Schema({ collection: 'cycles', timestamps: true })
export class Cycle {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public name: string;

    @Prop({ required: true, enum: CycleType })
    public type: CycleType;

    @Prop()
    public description: string;

    @Prop({ type: Boolean, default: true })
    public display: boolean;

    @Prop({ required: true, enum: ExecutableStatus, default: ExecutableStatus.STOPPED })
    public status: ExecutableStatus;

    @Prop({ type: CycleStyleSchema, required: true })
    public style: CycleStyle;

    @Prop({ required: true, enum: ExecutionMode, default: ExecutionMode.SEQUENTIAL })
    public executionMode: ExecutionMode;

    @Prop({ type: [ConditionSchema], default: [] })
    public conditions: Condition[];

    @Prop({ type: [ModePrioritySchema], default: [] })
    public modePriority: ModePriority[];

    @Prop({ type: String, ref: 'Cycle', default: null })
    public parentCycleId: string | null;

    @Prop({ type: [ChildCycleSchema], default: [] })
    public childCycles: ChildCycle[];

    @Prop({ type: Date, default: null })
    public deletedAt: Date | null;
}

export const CycleSchema = SchemaFactory.createForClass(Cycle);
