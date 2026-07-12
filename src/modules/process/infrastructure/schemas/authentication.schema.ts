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
}
export const AuthenticationSchema = SchemaFactory.createForClass(Authentication);
