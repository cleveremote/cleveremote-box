import { ApiProperty } from '@nestjs/swagger';
import { StructureModel } from '@process/domain/models/structure.model';
import { IsNotEmpty, IsString } from 'class-validator';
import { StructureEntity } from '../entities/structure.entity';


export enum USER_ENS_TYPE {
    CA = '499',
    CS = '993',
    CM = '400'
}
export class ConfigurationSynchronizeDTO {

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public configuration: string;

    public static mapToNotificationModel(notificationCreateDTO: ConfigurationSynchronizeDTO): StructureModel {
        return StructureEntity.mapToStructureModel(notificationCreateDTO);
    }
}

