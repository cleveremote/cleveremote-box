export class RecoveryCodeModel {
    public id: string;
    public login: string;
    // hash bcrypt du code envoyé par mail
    public code: string;
    public expiresAt: Date;
}
