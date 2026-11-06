// code retour de AuthenticationService.manageAuthentication (login standard et flux de récupération)
export enum AuthenticationStatus {
    SUCCESS = 'SUCCESS',
    MISSING_PASSWORD = 'MISSING_PASSWORD',
    NOT_INITIALIZED = 'NOT_INITIALIZED', // aucun credential stocké
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
    ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
    RECOVERY_CODE_SENT = 'RECOVERY_CODE_SENT',
    RECOVERY_UNAVAILABLE = 'RECOVERY_UNAVAILABLE', // login inconnu ou sans email
    RECOVERY_MAIL_FAILED = 'RECOVERY_MAIL_FAILED',
    RECOVERY_CODE_VALID = 'RECOVERY_CODE_VALID',
    RECOVERY_CODE_INVALID = 'RECOVERY_CODE_INVALID',
    RECOVERY_CODE_EXPIRED = 'RECOVERY_CODE_EXPIRED', // absent ou expiré
    RECOVERY_CODE_TOO_MANY_ATTEMPTS = 'RECOVERY_CODE_TOO_MANY_ATTEMPTS', // code invalidé
    PASSWORD_RESET = 'PASSWORD_RESET',
    PASSWORD_RESET_FAILED = 'PASSWORD_RESET_FAILED'
}

// statuts considérés comme une réussite ; tout autre statut est une erreur à afficher
export const AUTHENTICATION_SUCCESS_STATUSES: ReadonlySet<AuthenticationStatus> = new Set([
    AuthenticationStatus.SUCCESS,
    AuthenticationStatus.RECOVERY_CODE_SENT,
    AuthenticationStatus.RECOVERY_CODE_VALID,
    AuthenticationStatus.PASSWORD_RESET
]);

export class AuthenticationResultModel {
    // false : erreur (message à afficher comme tel)
    public success: boolean;
    public status: AuthenticationStatus;
    // phrase lisible déjà traduite dans la langue des global settings : affichée telle quelle par le front
    public message: string;
    // échecs consécutifs (login) ou essais du code de récupération
    public failedAttempts?: number;
    // essais restants avant le prochain verrou (login) ou avant invalidation du code
    public attemptsRemaining?: number;
    // instant UTC de déblocage du compte
    public lockedUntil?: Date | null;
    // instant UTC d'expiration du code de récupération envoyé
    public codeExpiresAt?: Date;
}
