import { Controller, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { ToErrorPayload } from '@framework/errors/box-error.messages';
import { RpcErrorsFilter, RpcValidationExceptionFactory } from '@framework/errors/rpc-errors';
import { Language } from '@framework/i18n/language';
import { DeviceCommandService } from '@process/domain/services/device-command.service';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { RegisterMapTemplate, RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';
import { DeviceCommandExecuteDTO, RegisterMapFetchDTO, RegisterMapListDTO, RegisterOperationExecuteDTO } from '../dto/register-map.dto';

@Controller()
@UseFilters(new RpcErrorsFilter())
@UsePipes(new ValidationPipe({ transform: true, exceptionFactory: RpcValidationExceptionFactory }))
export class RegisterMapController {

    public constructor(private _deviceCommandService: DeviceCommandService, private _globalSettingsService: GlobalSettingsService) { }

    /** Toutes les register maps disponibles (register-maps/*.json), traduites en `lang` */
    @MessagePattern(['box/fetch/register-maps'])
    public fetchAll(@Payload() dto: RegisterMapListDTO): RegisterMapTemplate[] {
        const lang = this._lang(dto);
        return this._deviceCommandService.listTemplates().map((template) => this._deviceCommandService.translateTemplate(template, lang));
    }

    /** Register map d'un slave (deviceId) ou d'un kind */
    @MessagePattern(['box/fetch/register-map'])
    public async fetch(@Payload() dto: RegisterMapFetchDTO): Promise<RegisterMapTemplate> {
        const lang = this._lang(dto);
        return this._toRpc(async () => this._deviceCommandService.translateTemplate(dto.kind
            ? this._deviceCommandService.getTemplate(dto.kind)
            : await this._deviceCommandService.getTemplateByDevice(dto.deviceId), lang), lang);
    }

    /** Exécute une opération unitaire ; erreurs Modbus/réseau dans le résultat, saisie invalide en RpcException */
    @MessagePattern(['box/execution/register-map'])
    public async execute(@Payload() dto: RegisterOperationExecuteDTO): Promise<RegisterOperationOutcome> {
        const lang = this._lang(dto);
        return this._toRpc(() => this._deviceCommandService.executeOnDevice(dto.deviceId, RegisterOperationExecuteDTO.mapToCommand(dto), lang), lang);
    }

    /** Exécute une DeviceCommand sur un slave de son modèle ; erreurs Modbus/réseau dans le résultat, commande invalide en RpcException */
    @MessagePattern(['box/execution/device-command'])
    public async executeCommand(@Payload() dto: DeviceCommandExecuteDTO): Promise<RegisterOperationOutcome> {
        const lang = this._lang(dto);
        return this._toRpc(() => this._deviceCommandService.execute(dto.commandId, dto.deviceId, DeviceCommandExecuteDTO.mapToOverride(dto), lang),
            lang);
    }

    // langue demandee par le front, sinon langue par defaut de la box
    private _lang(dto: { lang?: Language } | undefined): Language {
        return dto?.lang ?? this._globalSettingsService.language;
    }

    // erreur codee : message traduit dans `lang`
    private async _toRpc<T>(run: () => T | Promise<T>, lang: Language): Promise<T> {
        try {
            return await run();
        } catch (err) {
            throw new RpcException({ status: 'error', ...ToErrorPayload(err, lang) });
        }
    }
}
