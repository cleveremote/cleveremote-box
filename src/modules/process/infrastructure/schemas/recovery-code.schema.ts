import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';

export type RecoveryCodeDocument = RecoveryCode & Document;

@Schema({ collection: 'recovery_codes', timestamps: true })
export class RecoveryCode {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    // un seul code actif par login : une nouvelle demande remplace la précédente
    @Prop({ required: true, unique: true })
    public login: string;

    @Prop({ required: true })
    public code: string;

    // index TTL : Mongo purge le document une fois expiré (la vérification reste faite côté service)
    @Prop({ type: Date, required: true, expires: 0 })
    public expiresAt: Date;

    // essais de vérification échoués : le code est invalidé au-delà du maximum
    @Prop({ type: Number, default: 0 })
    public attempts: number;
}
export const RecoveryCodeSchema = SchemaFactory.createForClass(RecoveryCode);
