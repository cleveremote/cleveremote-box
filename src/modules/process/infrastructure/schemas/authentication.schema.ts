import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { randomUUID } from 'node:crypto';

export type AuthenticationDocument = Authentication & Document;

@Schema({ collection: 'authentications', timestamps: true })
export class Authentication {
    @Prop({ type: String, default: () => randomUUID() })
    public _id: string;

    @Prop({ required: true })
    public login: string;

    @Prop({ required: true })
    public password: string;

    // renseigné par cleveremote-updater (collection partagée) : destinataire du code de récupération
    @Prop({ type: String, default: null, trim: true, lowercase: true })
    public email: string | null;

    // échecs de connexion consécutifs (remis à 0 sur succès ou réinitialisation du mot de passe)
    @Prop({ type: Number, default: 0 })
    public failedAttempts: number;

    // verrou progressif : connexion refusée jusqu'à cet instant
    @Prop({ type: Date, default: null })
    public lockedUntil: Date | null;
}
export const AuthenticationSchema = SchemaFactory.createForClass(Authentication);
