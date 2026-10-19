/** Commande ou saisie incompatible avec le template (valeur hors plage, confirmation manquante, formule invalide…) */
export class RegisterMapInputError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'RegisterMapInputError';
    }
}

/** Bloc ou opération absent du template */
export class RegisterMapNotFoundError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'RegisterMapNotFoundError';
    }
}
