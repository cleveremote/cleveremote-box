import { ProcessMode, RankedProcessMode } from '../interfaces/executable.interface';

export class LocalCoordinatesModel {
    public latitude: number;
    public longitude: number;
}

// rang de chaque origine lors de l'arbitrage d'un conflit d'actuator : le plus petit rang passe
// en premier, a rang egal le front doit confirmer.
export type ModeRanksModel = Record<RankedProcessMode, number>;

export const DEFAULT_MODE_RANKS: ModeRanksModel = {
    [ProcessMode.MANUAL]: 0,
    [ProcessMode.SCHEDULED]: 1,
    [ProcessMode.TRIGGER]: 2
};

export class GlobalSettingsModel {
    public id: string;
    public localCoordinates: LocalCoordinatesModel;
    public modeRanks?: ModeRanksModel;
    public version?: string;
}
