import { Controller, UsePipes, ValidationError, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { DeviceCommandService } from '@process/domain/services/device-command.service';
import { RegisterMapTemplate, RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';
import { RegisterMapFetchDTO, RegisterOperationExecuteDTO } from '../dto/register-map.dto';

function ValidationExceptionFactory(errors: ValidationError[]): RpcException {
    return new RpcException(errors.flatMap((e) => Object.values(e.constraints ?? {})).join(', '));
}

@Controller()
@UsePipes(new ValidationPipe({ transform: true, exceptionFactory: ValidationExceptionFactory }))
export class RegisterMapController {

    public constructor(private _deviceCommandService: DeviceCommandService) { }

    /** Toutes les register maps disponibles (register-maps/*.json) */
    @MessagePattern(['box/fetch/register-maps'])
    public fetchAll(): RegisterMapTemplate[] {
        return this._deviceCommandService.listTemplates();
    }

    /** Register map d'un slave (deviceId) ou d'un kind */
    @MessagePattern(['box/fetch/register-map'])
    public async fetch(@Payload() dto: RegisterMapFetchDTO): Promise<RegisterMapTemplate> {
        return this._toRpc(() => dto.kind
            ? this._deviceCommandService.getTemplate(dto.kind)
            : this._deviceCommandService.getTemplateByDevice(dto.deviceId));
    }

    /** Exécute une opération unitaire ; erreurs Modbus/réseau dans le résultat, saisie invalide en RpcException */
    @MessagePattern(['box/execution/register-map'])
    public async execute(@Payload() dto: RegisterOperationExecuteDTO): Promise<RegisterOperationOutcome> {
        return this._toRpc(() => this._deviceCommandService.executeOnDevice(dto.deviceId, RegisterOperationExecuteDTO.mapToCommand(dto)));
    }

    private async _toRpc<T>(run: () => T | Promise<T>): Promise<T> {
        try {
            return await run();
        } catch (err) {
            throw new RpcException(err instanceof Error ? err.message : String(err));
        }
    }
}
