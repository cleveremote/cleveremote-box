import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
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
