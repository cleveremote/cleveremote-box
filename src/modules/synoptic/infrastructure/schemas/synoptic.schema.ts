import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SvgNode, SynopticAssignmentType } from '@synoptic/domain/models/synoptic.model';

export type SynopticDocument = Synoptic & Document;

@Schema({ _id: false })
export class SynopticAssignment {
    @Prop({ required: true, enum: SynopticAssignmentType })
    public type: SynopticAssignmentType;

    @Prop({ required: true })
    public targetId: string;
}
export const SynopticAssignmentSchema = SchemaFactory.createForClass(SynopticAssignment);

@Schema({ _id: false })
export class SynopticElement {
    @Prop({ required: true })
    public elementId: string;

    @Prop()
    public valueElementId?: string;

    @Prop({ type: SynopticAssignmentSchema, default: null })
    public assignment?: SynopticAssignment | null;
}
export const SynopticElementSchema = SchemaFactory.createForClass(SynopticElement);

// minimize: false : les objets vides de svgJson (attributes: {}) sont conserves tels quels
@Schema({ collection: 'synoptics', timestamps: true, minimize: false })
export class Synoptic {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true, trim: true })
    public name: string;

    @Prop()
    public description?: string;

    // arbre svgson du fichier importe, non modifie
    @Prop({ type: SchemaTypes.Mixed, required: true })
    public svgJson: SvgNode;

    // cle = suffixe commun de s_element_<cle> / s_element_value_<cle>
    @Prop({ type: Map, of: SynopticElementSchema, default: {} })
    public elements: Map<string, SynopticElement>;
}
export const SynopticSchema = SchemaFactory.createForClass(Synoptic);

// nom unique sans tenir compte de la casse (strength 2)
export const SYNOPTIC_NAME_COLLATION = { locale: 'en', strength: 2 };
SynopticSchema.index({ name: 1 }, { unique: true, collation: SYNOPTIC_NAME_COLLATION });
