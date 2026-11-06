export class AuthenticationModel {
    public id: string;
    public login: string;
    public password: string;
    public email?: string | null;
    // true : récupération de mot de passe (code absent => envoi du code par mail, sinon vérification du code + remplacement par newPassword)
    public isRecovery?: boolean;
    // code de récupération reçu par mail
    public code?: string;
    // nouveau mot de passe (en clair) qui remplace l'ancien si le code est valide
    public newPassword?: string;
    // échecs de connexion consécutifs
    public failedAttempts?: number;
    // connexion refusée jusqu'à cet instant
    public lockedUntil?: Date | null;
}
