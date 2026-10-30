import { ControlAlgorithm, PidParamsModel } from '@control/domain/models/control.model';

export { ControlAlgorithm, PidParamsModel };

// Régulation d'un actionneur CTRL sur la mesure d'un sensor (ex: vanne proportionnelle <-> débitmètre).
// Indépendante de la config physique de l'actionneur : exécutée par RegulationService via le module control.
export class ControlLoopModel {
    public _id: string;
    public name: string;
    public actuatorId: string;
    // sensor de retour (mesure comparée à la consigne)
    public sensorId: string;
    public algorithm: ControlAlgorithm = ControlAlgorithm.P;
    // consigne, dans l'unité du sensor
    public setpoint: number;
    public params: PidParamsModel = new PidParamsModel();
    public isEnabled?: boolean = true;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
