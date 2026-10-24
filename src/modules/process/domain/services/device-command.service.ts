import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { DeviceCommandRepository } from '@process/infrastructure/repositories/device-command.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { RegisterMapNotFoundError } from '@register-map/domain/errors/register-map.error';
import { ModbusConnection, ModbusTransport } from '@register-map/domain/models/modbus-connection.model';
import { RegisterMapTemplate, RegisterOperationCommand, RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';
import { REGISTER_MAPS_DIR, RegisterMapLoader } from '@register-map/domain/services/register-map-loader.service';
import { RegisterMapService } from '@register-map/domain/services/register-map.service';
import { DeviceCommandModel, DeviceCommandOverride } from '../models/device-command.model';
import { DeviceModel, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '../models/device.model';
import { ModbusService } from './modbus.service';
import { WaveshareDiscoveryService } from './waveshare-discovery.service';

interface ResolvedCommand {
    command: DeviceCommandModel;
    template: RegisterMapTemplate;
    connection: ModbusConnection;
}

/**
 * Exécution des DeviceCommand (remplaçant des ComRequest) : résout le slave, sa register map
 * (par kind) et la connexion de son master, puis délègue au RegisterMapService du module register-map.
 */
@Injectable()
export class DeviceCommandService {
    private _templates?: Map<string, RegisterMapTemplate>;

    public constructor(
        private readonly deviceCommandRepository: DeviceCommandRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly registerMapService: RegisterMapService,
        private readonly registerMapLoader: RegisterMapLoader,
        private readonly modbusService: ModbusService,
        private readonly waveshareDiscoveryService: WaveshareDiscoveryService
    ) { }

    /**
     * Exécute la commande (ou son id) ; `override` remplace voie / valeur par défaut. Commande invalide :
     * exception ; erreurs Modbus/réseau : dans le résultat (outcome.isOk = false).
     */
    public async execute(command: DeviceCommandModel | string, override: DeviceCommandOverride = {}): Promise<RegisterOperationOutcome> {
        const { command: model, template, connection } = await this._resolve(command);
        const { blockId, operationId, channel, value, isPersistent, isConfirmed } = model;
        const operation: RegisterOperationCommand = { blockId, operationId, channel, value, isPersistent, isConfirmed, ...this._defined(override) };
        // Coexistence avec les ComRequest : la file de ModbusService sérialise aussi ce chemin sur le bus
        return this.modbusService.runExclusive(() => this.registerMapService.execute(template, connection, operation));
    }

    /** La commande vise une sortie digitale (bloc de coils) */
    public async isDigitalOutput(commandId: string): Promise<boolean> {
        const { command, template } = await this._resolve(commandId);
        return this.registerMapService.findOperation(template, command.blockId, command.operationId).block.area === 'coil';
    }

    /** Plage [min, max] de la saisie numérique de l'opération (ex: consigne analogique en mV) ; undefined si non numérique */
    public async numberRange(commandId: string): Promise<{ min: number; max: number } | undefined> {
        const { command, template } = await this._resolve(commandId);
        const input = this.registerMapService.findOperation(template, command.blockId, command.operationId).operation.input;
        return input?.type === 'number' ? { min: input.min, max: input.max } : undefined;
    }

    /** Register map d'un kind, depuis les fichiers JSON (chargés une seule fois) */
    public getTemplate(kind: string): RegisterMapTemplate {
        this._templates ??= new Map(this.registerMapLoader.loadFromDirectory(join(process.cwd(), REGISTER_MAPS_DIR)).map((t) => [t.kind, t]));
        const template = this._templates.get(kind);
        if (!template) {
            throw new RegisterMapNotFoundError(`Aucune register map pour le kind ${kind}`);
        }
        return template;
    }

    private async _resolve(command: DeviceCommandModel | string): Promise<ResolvedCommand> {
        const model = typeof command === 'string' ? await this.deviceCommandRepository.get(command) as DeviceCommandModel : command;
        if (!model) {
            throw new RegisterMapNotFoundError(`DeviceCommand ${command} introuvable`);
        }
        const slave = await this.deviceRepository.get(model.deviceId) as DeviceModel;
        const slaveConfig = slave?.config as SlaveConfigModel;
        if (!slaveConfig?.kind) {
            throw new RegisterMapNotFoundError(`Slave ${model.deviceId} introuvable ou sans kind`);
        }
        const master = await this.deviceRepository.get(slaveConfig.masterDeviceId) as DeviceModel;
        if (!master) {
            throw new RegisterMapNotFoundError(`Master ${slaveConfig.masterDeviceId} du slave ${model.deviceId} introuvable`);
        }
        return { command: model, template: this.getTemplate(slaveConfig.kind), connection: this._toConnection(master.config as MasterConfigModel, slaveConfig.slaveId) };
    }

    private _toConnection(masterConfig: MasterConfigModel, unitId: number): ModbusConnection {
        const connection: ModbusConnection = masterConfig.protocol === MasterProtocol.RTU
            ? { transport: ModbusTransport.RTU, path: masterConfig.path, baudRate: masterConfig.baudRate, unitId }
            : { transport: ModbusTransport.TCP, host: masterConfig.ipAddress, port: masterConfig.port, unitId };
        connection.timeout = masterConfig.timeout;
        // IP obsolète (master en DHCP) : retrouvée par son deviceId Waveshare, masterConfig mis à jour en place
        connection.onUnreachable = async () => (await this.waveshareDiscoveryService.refreshMasterAddress(masterConfig))
            ? this._toConnection(masterConfig, unitId)
            : undefined;
        return connection;
    }

    // Une surcharge non renseignée ne doit pas écraser la valeur par défaut de la commande
    private _defined(override: DeviceCommandOverride): DeviceCommandOverride {
        return Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined));
    }
}
