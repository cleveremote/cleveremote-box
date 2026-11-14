import { BoxError, BoxErrorCode, BoxErrorParams } from '@framework/errors/box-error';

/** Commande ou saisie incompatible avec le template (valeur hors plage, confirmation manquante, formule invalide…) */
export class RegisterMapInputError extends BoxError {
    public constructor(message: string, code: BoxErrorCode, params?: BoxErrorParams) {
        super(message, code, params);
        this.name = 'RegisterMapInputError';
    }
}

/** Bloc ou opération absent du template */
export class RegisterMapNotFoundError extends BoxError {
    public constructor(message: string, code: BoxErrorCode, params?: BoxErrorParams) {
        super(message, code, params);
        this.name = 'RegisterMapNotFoundError';
    }
}
