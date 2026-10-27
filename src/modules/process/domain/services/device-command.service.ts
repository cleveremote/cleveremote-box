import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DeviceCommandRepository } from '@process/infrastructure/repositories/device-command.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { SlaveTemplateRepository } from '@process/infrastructure/repositories/slave-template.repository';
import { RegisterMapNotFoundError } from '@register-map/domain/errors/register-map.error';
import { ModbusConnection } from '@register-map/domain/models/modbus-connection.model';
import { READ_FUNCTIONS, RegisterMapTemplate, RegisterOperationCommand, RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';
import { REGISTER_MAPS_DIR, RegisterMapLoader } from '@register-map/domain/services/register-map-loader.service';
import { RegisterMapService } from '@register-map/domain/services/register-map.service';
import { ActuatorActionConfig } from '../models/actuator.model';
import { DeviceCommandModel, DeviceCommandOverride, DeviceCommandType } from '../models/device-command.model';
import { DeviceModel, MasterConfigModel, SlaveConfigModel, SlaveTemplate } from '../models/device.model';
import { DeviceCommandValue, hasCommandType, outcomeValues } from '../utils/device-command.util';
import { ModbusDeviceService } from './modbus-device.service';

interface ResolvedDevice {
    slave: DeviceModel;
    template: RegisterMapTemplate;
    connection: ModbusConnection;
}

interface ResolvedCommand extends ResolvedDevice {
    command: DeviceCommandModel;
}

export interface TypedAction {
    action: ActuatorActionConfig;
    command: DeviceCommandModel;
}

/**
 * Exécution des DeviceCommand : une commande appartient à un modèle et s'exécute sur un slave de ce modèle,
 * fourni à l'appel. Résout le slave, sa register map (par kind) et la connexion de son master, puis délègue
 * au RegisterMapService du module register-map.
 */
@Injectable()
export class DeviceCommandService {
    private _templates?: Map<string, RegisterMapTemplate>;

    public constructor(
        private readonly deviceCommandRepository: DeviceCommandRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly slaveTemplateRepository: SlaveTemplateRepository,
        private readonly registerMapService: RegisterMapService,
        private readonly registerMapLoader: RegisterMapLoader,
        private readonly modbusDeviceService: ModbusDeviceService,
        private readonly logger: Logger
    ) { }

    /**
     * Exécute la commande (ou son id) sur le slave `deviceId`, qui doit être du modèle de la commande ;
     * `override` remplace voie / valeur par défaut. Commande invalide : exception ; erreurs Modbus/réseau :
     * dans le résultat (outcome.isOk = false).
     */
    public async execute(
        command: DeviceCommandModel | string,
        deviceId: string,
        override: DeviceCommandOverride = {}
    ): Promise<RegisterOperationOutcome> {
        return this._execute(await this._resolve(command, deviceId), override);
    }

    /**
     * Exécute la commande de lecture (ou son id) sur le slave `deviceId` et renvoie ses valeurs numériques, limitées
     * aux champs `fields` (sinon à ceux de la commande, sinon tous). Échec d'exécution ou champ absent : exception.
     */
    public async read(command: DeviceCommandModel | string, deviceId: string, fields?: string[]): Promise<DeviceCommandValue[]> {
        const resolved = await this._resolve(command, deviceId);
        return outcomeValues(await this._execute(resolved), fields ?? resolved.command.fields);
    }

    /** Exécute une opération de la register map d'un slave, sans DeviceCommand enregistrée (banc de test, config onduleur) */
    public async executeOnDevice(deviceId: string, operation: RegisterOperationCommand): Promise<RegisterOperationOutcome> {
        const { template, connection } = await this._resolveDevice(deviceId);
        return this.registerMapService.execute(template, connection, operation);
    }

    /**
     * Exécute dans l'ordre les commandes init du modèle du slave non encore appliquées sur ce slave, et les
     * marque appliquées (config.initDoneCommandIds). Un échec est loggé sans interrompre les suivantes.
     */
    public async runInitCommands(deviceId: string): Promise<void> {
        const slave = await this._getModelSlave(deviceId);
        if (!slave) return;
        const config = slave.config as SlaveConfigModel;
        const done = new Set(config.initDoneCommandIds ?? []);
        const commands = await this.deviceCommandRepository.getCommandsByType(config.modelId, DeviceCommandType.INIT);
        await this._runSequence(deviceId, commands.filter((c) => !done.has(c._id)), async (command) => {
            done.add(command._id);
            config.initDoneCommandIds = [...done];
            await this.deviceRepository.save(slave);
        });
    }

    /**
     * Exécute dans l'ordre toutes les commandes reset du modèle du slave, puis rejoue toutes ses commandes init
     * (initDoneCommandIds du slave vidé ; les autres slaves du modèle ne sont pas touchés).
     */
    public async runResetCommands(deviceId: string): Promise<void> {
        const slave = await this._getModelSlave(deviceId);
        if (!slave) return;
        const config = slave.config as SlaveConfigModel;
        await this._runSequence(deviceId, await this.deviceCommandRepository.getCommandsByType(config.modelId, DeviceCommandType.RESET));
        config.initDoneCommandIds = [];
        await this.deviceRepository.save(slave);
        await this.runInitCommands(deviceId);
    }

    /** Actions d'un actionneur dont la commande porte `type`, dans l'ordre de `actions` */
    public async actionsOfType(actions: ActuatorActionConfig[] | undefined, type: DeviceCommandType): Promise<TypedAction[]> {
        if (!actions?.length) return [];
        const commands = new Map((await this.deviceCommandRepository.getByIds(actions.map((a) => a.commandId))).map((c) => [c._id, c]));
        return actions
            .map((action) => ({ action, command: commands.get(action.commandId) }))
            .filter(({ command }) => command && hasCommandType(command, type));
    }

    /**
     * Exécute dans l'ordre, sur le slave `deviceId`, les actions d'un actionneur dont la commande porte `type`,
     * sur la voie de l'action (et `value` si fournie). Un échec est loggé sans interrompre les suivantes.
     */
    public async runActions(
        deviceId: string,
        actions: ActuatorActionConfig[],
        type: DeviceCommandType,
        value?: DeviceCommandOverride['value']
    ): Promise<RegisterOperationOutcome[]> {
        const outcomes: RegisterOperationOutcome[] = [];
        for (const { action, command } of await this.actionsOfType(actions, type)) {
            try {
                outcomes.push(await this.execute(command, deviceId, { channel: action.channel, value }));
            } catch (err) {
                this.logger.error({ deviceId, commandId: command._id, type, err: err.message }, 'device command failed');
            }
        }
        return outcomes;
    }

    /** La commande, exécutée sur le slave `deviceId`, vise une sortie digitale (bloc de coils) */
    public async isDigitalOutput(commandId: string, deviceId: string): Promise<boolean> {
        const { command, template } = await this._resolve(commandId, deviceId);
        return this.isDigitalOutputOf(template.kind, command);
    }

    /** Même test, sans device enregistré (ex: slave en cours de création depuis un template) */
    public isDigitalOutputOf(kind: string, command: Pick<DeviceCommandModel, 'blockId' | 'operationId'>): boolean {
        return this.registerMapService.findOperation(this.getTemplate(kind), command.blockId, command.operationId).block.area === 'coil';
    }

    /** Plage [min, max] de la saisie numérique de l'opération (ex: consigne analogique en mV) ; undefined si non numérique */
    public async numberRange(commandId: string, deviceId: string): Promise<{ min: number; max: number } | undefined> {
        const { command, template } = await this._resolve(commandId, deviceId);
        const input = this.registerMapService.findOperation(template, command.blockId, command.operationId).operation.input;
        return input?.type === 'number' ? { min: input.min, max: input.max } : undefined;
    }

    /**
     * Ajoute à chaque commande ses `params` (voie, valeur et leur type détaillé) depuis la register map du kind de son modèle.
     * `models` : liste déjà chargée (sinon lue en base). Kind ou opération introuvable : commande renvoyée sans params (warn).
     */
    public async withParams<T extends DeviceCommandModel>(commands: T[], models?: SlaveTemplate[]): Promise<T[]> {
        const kinds = new Map((models ?? await this.slaveTemplateRepository.get()).map((model) => [model._id, model.kind]));
        return commands.map((command) => this._withParams(kinds.get(command.modelId), command.modelId, command));
    }

    /** Même enrichissement pour les commandes d'un slave template (typage des saisies du formulaire front) */
    public withTemplateParams(template: SlaveTemplate): SlaveTemplate {
        return { ...template, deviceCommands: template.deviceCommands.map((command) => this._withParams(template.kind, template._id, command)) };
    }

    /**
     * Une commande par opération de la register map : usage read ou set selon la fonction Modbus, voie 0 (scope
     * 'channel'), valeur par défaut de la saisie numérique ; lecture : tous ses champs (fields absent, params.result les
     * décrit pour une sélection ultérieure). _id stable (modèle + bloc + opération) : regénérer donne
     * les mêmes commandes. Blocs `danger` : isConfirmed à false, à confirmer explicitement avant exécution.
     */
    public fromRegisterMap(modelId: string, registerMap: RegisterMapTemplate): SlaveTemplate['deviceCommands'] {
        return registerMap.registerMap.flatMap((block) => block.operations.map((operation) => {
            const isRead = READ_FUNCTIONS.includes(operation.function);
            return {
                _id: this._stableId(modelId, block.id, operation.id),
                name: `${block.label} — ${operation.label}`,
                description: block.description,
                blockId: block.id,
                operationId: operation.id,
                channel: operation.scope === 'channel' ? 0 : undefined,
                value: !isRead && operation.input?.type === 'number' ? operation.input.default : undefined,
                isPersistent: false,
                isConfirmed: false,
                types: [isRead ? DeviceCommandType.READ : DeviceCommandType.SET]
            };
        }));
    }

    // UUID (format v5) dérivé de ses parties : même entrée = même _id sur toutes les box
    private _stableId(...parts: string[]): string {
        const hex = createHash('sha1').update(parts.join(':')).digest('hex');
        const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    }

    private _withParams<T extends Pick<DeviceCommandModel, 'blockId' | 'operationId' | 'params'> & { _id?: string }>(kind: string, modelId: string, command: T): T {
        try {
            return { ...command, params: this.registerMapService.describeParams(this.getTemplate(kind), command.blockId, command.operationId) };
        } catch (err) {
            this.logger.warn({ modelId, commandId: command._id, err: err.message }, 'device command params unresolved');
            return command;
        }
    }

    /** Register map d'un kind, depuis les fichiers JSON (chargés une seule fois) */
    public getTemplate(kind: string): RegisterMapTemplate {
        const template = this._loadTemplates().get(kind);
        if (!template) {
            throw new RegisterMapNotFoundError(`Aucune register map pour le kind ${kind}`);
        }
        return template;
    }

    /** Toutes les register maps disponibles */
    public listTemplates(): RegisterMapTemplate[] {
        return [...this._loadTemplates().values()];
    }

    /** Register map d'un slave (par son kind) */
    public async getTemplateByDevice(deviceId: string): Promise<RegisterMapTemplate> {
        return (await this._resolveDevice(deviceId)).template;
    }

    private _loadTemplates(): Map<string, RegisterMapTemplate> {
        this._templates ??= new Map(this.registerMapLoader.loadFromDirectory(join(process.cwd(), REGISTER_MAPS_DIR)).map((t) => [t.kind, t]));
        return this._templates;
    }

    private async _resolve(command: DeviceCommandModel | string, deviceId: string): Promise<ResolvedCommand> {
        const model = typeof command === 'string' ? await this.deviceCommandRepository.get(command) as DeviceCommandModel : command;
        if (!model) {
            throw new RegisterMapNotFoundError(`DeviceCommand ${command} introuvable`);
        }
        const resolved = await this._resolveDevice(deviceId);
        const modelId = (resolved.slave.config as SlaveConfigModel).modelId;
        if (modelId !== model.modelId) {
            throw new RegisterMapNotFoundError(
                `DeviceCommand ${model._id} (modèle ${model.modelId}) non exécutable sur le slave ${deviceId} (modèle ${modelId})`);
        }
        return { command: model, ...resolved };
    }

    private async _getSlave(deviceId: string): Promise<DeviceModel> {
        const slave = await this.deviceRepository.get(deviceId) as DeviceModel;
        if (!(slave?.config as SlaveConfigModel)?.kind) {
            throw new RegisterMapNotFoundError(`Slave ${deviceId} introuvable ou sans kind`);
        }
        return slave; 
    }

    // Slave rattaché à un modèle ; sans modelId (slave antérieur aux modèles) : undefined (warn), aucune commande à jouer
    private async _getModelSlave(deviceId: string): Promise<DeviceModel | undefined> {
        const slave = await this._getSlave(deviceId);
        if (!(slave.config as SlaveConfigModel).modelId) {
            this.logger.warn({ deviceId }, 'slave without modelId, device commands skipped');
            return undefined;
        }
        return slave;
    }

    private async _resolveDevice(deviceId: string): Promise<ResolvedDevice> {
        const slave = await this._getSlave(deviceId);
        const slaveConfig = slave.config as SlaveConfigModel;
        const master = await this.deviceRepository.get(slaveConfig.masterDeviceId) as DeviceModel;
        if (!master) {
            throw new RegisterMapNotFoundError(`Master ${slaveConfig.masterDeviceId} du slave ${deviceId} introuvable`);
        }
        const connection = this.modbusDeviceService.toConnection(master.config as MasterConfigModel, slaveConfig.slaveId);
        return { slave, template: this.getTemplate(slaveConfig.kind), connection };
    }

    private _execute({ command, template, connection }: ResolvedCommand, override: DeviceCommandOverride = {}): Promise<RegisterOperationOutcome> {
        const { blockId, operationId, channel, value, isPersistent, isConfirmed } = command;
        const operation: RegisterOperationCommand = { blockId, operationId, channel, value, isPersistent, isConfirmed, ...this._defined(override) };
        return this.registerMapService.execute(template, connection, operation);
    }

    // Commandes exécutées dans l'ordre ; `onSuccess` après chaque exécution réussie. Un échec est loggé sans interrompre les suivantes.
    private async _runSequence(
        deviceId: string,
        commands: DeviceCommandModel[],
        onSuccess?: (command: DeviceCommandModel) => Promise<void>
    ): Promise<void> {
        for (const command of commands) {
            try {
                const outcome = await this.execute(command, deviceId);
                if (outcome.isOk) {
                    await onSuccess?.(command);
                }
            } catch (err) {
                this.logger.error({ deviceId, commandId: command._id, types: command.types, err: err.message }, 'device command failed');
            }
        }
    }

    // Une surcharge non renseignée ne doit pas écraser la valeur par défaut de la commande
    private _defined(override: DeviceCommandOverride): DeviceCommandOverride {
        return Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined));
    }
}
