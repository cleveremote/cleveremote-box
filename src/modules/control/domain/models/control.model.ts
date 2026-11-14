export enum ControlAlgorithm {
    P = 'P',
    PI = 'PI',
    PID = 'PID'
}

export class PidParamsModel {
    public kP: number = 5;
    public kI: number = 0;
    public kD: number = 0;
    // écart (unité de la mesure) en dessous duquel la consigne est considérée atteinte
    public tolerance: number = 1;
    public maxIterations: number = 20;
    public iterationDelayMs: number = 500;
}

// Port implémenté par l'appelant : grandeur mesurée (read) et organe commandé (write), sans
// que le module control ne connaisse les capteurs/actionneurs qui sont derrière.
export interface ControlPlant {
    // bornes de la sortie (ex: ouverture de vanne minOpening/maxOpening en %)
    min: number;
    max: number;
    read(): Promise<number>;
    write(output: number): Promise<void>;
    current(): number;
    // temps physique pour que l'organe applique une variation `delta` de sortie, en ms
    settleMs(delta: number): number;
}

// état propre à une exécution de boucle, conservé entre deux itérations
export interface ControllerMemory {
    integral: number;
    previousError: number | null;
}

export interface ControlResult {
    setpoint: number;
    measured: number;
    output: number;
    isStabilized: boolean;
    iterations: number;
}
