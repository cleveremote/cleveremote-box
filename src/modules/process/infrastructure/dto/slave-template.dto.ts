import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DeviceKind, SlaveTemplate } from '@process/domain/models/device.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ComRequestConfigDTO, PortConfigDTO } from './synchronize.dto';

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

export class SlaveTemplateComRequestDTO {
    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Nom de la requête' })
    public name: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Description de la requête' })
    public description?: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(ComRequestType, { each: true })
    @ApiProperty({ description: 'Type(s) de la requête', enum: ComRequestType, isArray: true })
    public type: ComRequestType[];

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ComRequestConfigDTO)
    @ApiProperty({ description: 'Configuration Modbus' })
    public config: ComRequestConfigDTO;
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
    @Type(() => SlaveTemplateComRequestDTO)
    public comRequests: SlaveTemplateComRequestDTO[];

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
            comRequests: dto.comRequests.map((cr) => ({
                name: cr.name,
                description: cr.description,
                type: cr.type,
                config: {
                    function: cr.config.function,
                    address: cr.config.address,
                    disabled: cr.config.disabled,
                    done: cr.config.done ?? false,
                    type: cr.config.type,
                    params: cr.config.params || undefined
                }
            }))
        };
    }
}
