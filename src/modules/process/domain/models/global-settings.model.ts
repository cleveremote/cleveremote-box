export class LocalCoordinatesModel {
    public latitude: number;
    public longitude: number;
}

export class GlobalSettingsModel {
    public id: string;
    public localCoordinates: LocalCoordinatesModel;
    public version?: string;
}
