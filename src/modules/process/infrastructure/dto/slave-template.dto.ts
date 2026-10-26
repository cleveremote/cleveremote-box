import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DeviceKind, SlaveTemplate } from '@process/domain/models/device.model';
import { DeviceCommandBaseDTO, PortConfigDTO } from './synchronize.dto';

export class SlaveTemplateDeviceDTO {
    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Nom du slave créé à partir du template' })
    public name: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Description du slave' })
    public description?: string;

    @IsOptional()
    @IsEnum(DeviceKind)
    @ApiProperty({ description: 'Stratégie de pilotage du slave', enum: DeviceKind })
    public kind?: DeviceKind;

    @IsOptional()
    @ValidateNested()
    @Type(() => PortConfigDTO)
    @ApiProperty({ description: 'Configuration des ports' })
    public portConfig?: PortConfigDTO;
}

// Commande du modèle : _id présent = commande existante mise à jour (les actionneurs, sensors et séquences
// la référencent), absent = nouvelle commande
export class SlaveTemplateCommandDTO extends DeviceCommandBaseDTO {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Identifiant de la commande (absent = nouvelle commande)', required: false })
    public _id?: string;
}

export class SlaveTemplateDTO {
    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Identifiant du template (généré si absent, upsert si présent)' })
    public _id?: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Nom du template' })
    public name: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Description du template' })
    public description?: string;

    @IsEnum(DeviceKind)
    @ApiProperty({ description: 'Kind du module (détermine sa plage d\'adresses)', enum: DeviceKind })
    public kind: DeviceKind;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => SlaveTemplateDeviceDTO)
    public device: SlaveTemplateDeviceDTO;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SlaveTemplateCommandDTO)
    public deviceCommands: SlaveTemplateCommandDTO[];

    public static mapToSlaveTemplate(dto: SlaveTemplateDTO): SlaveTemplate {
        return {
            _id: dto._id,
            name: dto.name,
            description: dto.description,
            kind: dto.kind,
            device: {
                name: dto.device.name,
                description: dto.device.description,
                kind: dto.device.kind,
                portConfig: dto.device.portConfig && { ...dto.device.portConfig }
            },
            deviceCommands: dto.deviceCommands.map((command) => ({
                _id: command._id,
                name: command.name,
                description: command.description,
                blockId: command.blockId,
                operationId: command.operationId,
                channel: command.channel,
                value: command.value,
                isPersistent: command.isPersistent,
                isConfirmed: command.isConfirmed,
                types: [...command.types],
                params: command.params
            }))
        };
    }
}
