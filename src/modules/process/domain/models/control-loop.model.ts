import { ControlAlgorithm, PidParamsModel } from '@control/domain/models/control.model';

export { ControlAlgorithm, PidParamsModel };

export enum ControlLoopMode {
    // régulation fermée sur une consigne fixe (setpoint), jusqu'à stabilisation
    REGULATION = 'REGULATION',
    // suivi : l'ouverture recopie en continu la mesure du sensor (ex: potentiomètre) pendant le ON
    FOLLOW = 'FOLLOW'
}

// mode FOLLOW : projection de la mesure du sensor sur l'ouverture de la vanne
export class FollowParamsModel {
    // mesure correspondant à 0% / 100% d'ouverture, dans l'unité du sensor
    public inputMin: number = 0;
    public inputMax: number = 100;
    // variation d'ouverture (%) en dessous de laquelle la vanne n'est pas réécrite
    public deadband: number = 1;
}

// Régulation d'un actionneur CTRL sur la mesure d'un sensor (ex: vanne proportionnelle <-> débitmètre).
// Indépendante de la config physique de l'actionneur : exécutée par RegulationService via le module control.
export class ControlLoopModel {
    public _id: string;
    public name: string;
    public actuatorId: string;
    // sensor de retour (mesure comparée à la consigne, ou recopiée en mode FOLLOW)
    public sensorId: string;
    public mode: ControlLoopMode = ControlLoopMode.REGULATION;
    public algorithm: ControlAlgorithm = ControlAlgorithm.P;
    // consigne, dans l'unité du sensor
    public setpoint: number;
    public params: PidParamsModel = new PidParamsModel();
    // mode FOLLOW uniquement (setpoint/algorithm ignorés) ; période de lecture : params.iterationDelayMs
    public follow: FollowParamsModel = new FollowParamsModel();
    public isEnabled?: boolean = true;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
