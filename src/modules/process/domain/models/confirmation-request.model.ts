import { ProcessMode } from '../interfaces/executable.interface';

// cycle en cours en conflit (actuator partage) avec le cycle qui attend une confirmation
export class ConfirmationConflictModel {
    public cycleId: string;
    public name: string;
    public mode: ProcessMode;
    // true : rang du demandeur strictement plus petit, confirmer stoppera ce cycle ;
    // false : rang egal ou plus grand, c'est ce conflit qui impose la confirmation
    public isWinning: boolean;
    // true : cycle PROPORTIONAL d'une vanne sur laquelle le demandeur porte une consigne explicite (customValue).
    // Le demandeur est prioritaire (isWinning) mais la confirmation est quand meme demandee ; ce cycle
    // PROPORTIONAL est stoppe par la confirmation FORCE puis redemarre a la fin du demandeur.
    public isProportionalOverride?: boolean;
}

// detail d'une demande de confirmation (statut WAITTING_CONFIRMATION), pour que le front choisisse
// sa popin : conflit perdu (conflicts.some(!isWinning)), reprise d'une vanne a son cycle PROPORTIONAL
// (conflicts.some(isProportionalOverride)) ou simple confirmation demandee (isRequested).
export class ConfirmationRequestModel {
    // schedule / trigger avec shouldConfirmation : confirmation demandee meme sans conflit perdu
    public isRequested: boolean;
    // tous les cycles en conflit ; une confirmation FORCE les stoppe tous
    public conflicts: ConfirmationConflictModel[];
}
