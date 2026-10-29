import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';
import { DeviceCommandOverride } from '@process/domain/models/device-command.model';
import { DeviceKind } from '@process/domain/models/device.model';
import { RegisterOperationCommand, RegisterOperationValue } from '@register-map/domain/models/register-map.model';

export class RegisterMapFetchDTO {
    @ValidateIf((dto: RegisterMapFetchDTO) => !dto.kind)
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Slave dont on veut la register map (sinon kind)', required: false })
    public deviceId?: string;

    @IsOptional()
    @IsEnum(DeviceKind)
    @ApiProperty({ description: 'Kind dont on veut la register map', enum: DeviceKind, required: false })
    public kind?: DeviceKind;
}

export class RegisterOperationExecuteDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Slave cible' })
    public deviceId: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Identifiant du bloc (registerMap[].id)' })
    public blockId: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Identifiant de l\'opération (registerMap[].operations[].id)' })
    public operationId: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    @ApiProperty({ description: 'Index 0-based de la voie (scope channel)', required: false })
    public channel?: number;

    // Forme dépendante de operation.input (nombre, tableau, champs composite) : validée par le RegisterMapService du module register-map
    @IsOptional()
    @ApiProperty({ description: 'Valeur saisie (selon operation.input)', required: false })
    public value?: RegisterOperationValue;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'Confirmation des opérations sensibles (bloc danger)', required: false })
    public isConfirmed?: boolean;

    public static mapToCommand(dto: RegisterOperationExecuteDTO): RegisterOperationCommand {
        return {
            blockId: dto.blockId,
            operationId: dto.operationId,
            channel: dto.channel,
            value: dto.value,
            isConfirmed: dto.isConfirmed
        };
    }
}

export class OperationRangeDTO {
    @IsInt()
    @Min(0)
    @ApiProperty({ description: 'Première voie 0-based' })
    public min: number;

    @IsInt()
    @Min(0)
    @ApiProperty({ description: 'Dernière voie 0-based (incluse)' })
    public max: number;
}

// Surcharges de la commande à l'exécution (voie, sous-plage de voies, valeur, persistance, confirmation)
export class DeviceCommandExecuteParamsDTO {
    @IsOptional()
    @IsInt()
    @Min(0)
    @ApiProperty({ description: 'Index 0-based de la voie (scope channel), sinon voie de la commande', required: false })
    public channel?: number;

    @IsOptional()
    @ApiProperty({ description: 'Valeur saisie (selon operation.input), sinon valeur de la commande', required: false })
    public value?: RegisterOperationValue;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'Écriture persistante (operation.params.persistence), sinon valeur de la commande', required: false })
    public isPersistent?: boolean;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'Confirmation des opérations sensibles (bloc danger), sinon valeur de la commande', required: false })
    public isConfirmed?: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => OperationRangeDTO)
    @ApiProperty({ description: 'Voies visées (scope range), sinon toutes ; value couvre alors max - min + 1 voies', required: false, type: OperationRangeDTO })
    public range?: OperationRangeDTO;
}

export class DeviceCommandExecuteDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Slave cible (du modèle de la commande)' })
    public deviceId: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'DeviceCommand à exécuter' })
    public commandId: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => DeviceCommandExecuteParamsDTO)
    @ApiProperty({ description: 'Surcharges (voie, valeur)', required: false, type: DeviceCommandExecuteParamsDTO })
    public params?: DeviceCommandExecuteParamsDTO;

    @IsOptional()
    @IsString()
    public boxId?: string;

    public static mapToOverride(dto: DeviceCommandExecuteDTO): DeviceCommandOverride {
        const { channel, range, value, isPersistent, isConfirmed } = dto.params ?? {};
        return { channel, range, value, isPersistent, isConfirmed };
    }
}
