// critere de suppression des events (tous les champs sont cumulatifs ; aucun = toute la collection)
export class EventPurgeFilterModel {
    public elementIds?: string[]; // seulement ces elements
    public excludedElementIds?: string[]; // sauf ces elements
    public keptIds?: string[]; // sauf ces events
    public before?: Date; // seulement les events anterieurs a cette date
}

export enum EventPurgeSkipReason {
    ACTIVE_CYCLE = 'ACTIVE_CYCLE' // cycle en cours / en attente de confirmation / en file : son run serait ampute
}

export class EventPurgeResultModel {
    public deletedCount: number;
    public skipped: { elementId: string; name?: string; reason: EventPurgeSkipReason }[];
}
