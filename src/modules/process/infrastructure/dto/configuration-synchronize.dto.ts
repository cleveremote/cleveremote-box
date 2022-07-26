import { ApiProperty } from '@nestjs/swagger';
import { StructureModel } from '@process/domain/models/structure.model';
import { IsNotEmpty, IsString } from 'class-validator';
import { StructureEntity } from '../entities/structure.entity';

export class ConfigurationSynchronizeDTO {

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public configuration: string;

    public static mapToNotificationModel(notificationCreateDTO: ConfigurationSynchronizeDTO): StructureModel {
        return StructureEntity.mapToStructureModel(notificationCreateDTO);
    }
}

