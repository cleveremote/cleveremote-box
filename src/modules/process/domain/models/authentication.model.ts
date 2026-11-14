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

// box/synchronize/account : champ undefined = inchangé
export class AccountSynchronizeModel {
    public login: string;
    // mot de passe actuel en clair : confirme l'identité avant toute modification
    public password: string;
    // en clair, haché par AuthenticationService
    public newPassword?: string;
    // undefined = inchangé (null est ramené à undefined par le DTO : l'email ne peut pas être supprimé)
    public email?: string;
}

// box/send/verificationcode : email absent = email du compte
export class VerificationCodeSendModel {
    public login: string;
    public email?: string;
}

// box/check/verificationcode
export class VerificationCodeCheckModel {
    public login: string;
    public code: string;
}

// compte renvoyé au front : jamais de hash de mot de passe
export type AccountModel = Pick<AuthenticationModel, 'id' | 'login' | 'email' | 'failedAttempts' | 'lockedUntil'>;

export function ToAccountModel(authentication: AuthenticationModel): AccountModel {
    return {
        id: authentication.id,
        login: authentication.login,
        email: authentication.email ?? null,
        failedAttempts: authentication.failedAttempts ?? 0,
        lockedUntil: authentication.lockedUntil ?? null
    };
}
