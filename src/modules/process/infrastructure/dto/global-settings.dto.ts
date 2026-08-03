import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, ValidateNested } from 'class-validator';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';

export class LocalCoordinatesDTO {
    @IsNumber()
    @ApiProperty({ description: 'Latitude de la box' })
    public latitude: number;

    @IsNumber()
    @ApiProperty({ description: 'Longitude de la box' })
    public longitude: number;
}

export class GlobalSettingsSynchronizeDTO {
    @ValidateNested()
    @Type(() => LocalCoordinatesDTO)
    @ApiProperty({ description: 'Coordonnees locales de la box (latitude/longitude)' })
    public localCoordinates: LocalCoordinatesDTO;

    public static mapToGlobalSettingsModel(dto: GlobalSettingsSynchronizeDTO): GlobalSettingsModel {
        const model = new GlobalSettingsModel();
        model.localCoordinates = {
            latitude: dto.localCoordinates.latitude,
            longitude: dto.localCoordinates.longitude
        };
        return model;
    }
}
