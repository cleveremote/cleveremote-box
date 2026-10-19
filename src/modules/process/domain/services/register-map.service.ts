import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceKind, DeviceModel, SlaveConfigModel } from '../models/device.model';
import { ModbusFunctionName } from '../models/com-request.model';
import {
    DecodedChannel, DecodedValue, OperationResult, RegisterBlock, RegisterMapTemplate, RegisterOperation,
    RegisterOperationCommand, RegisterOperationError, RegisterOperationOutcome, RegisterRequest
} from '../models/register-map.model';
import { RegisterMapValidator, RegisterValueEncoder } from '../utils/register-map.util';
import { FormulaEvaluator, RegisterFieldDecoder } from '../utils/register-field.util';
import { ModbusService } from './modbus.service';

type ChannelResult = Extract<OperationResult, { type: 'boolean[]' | 'enum[]' }>;

interface BlockOperation {
    block: RegisterBlock;
    operation: RegisterOperation;
}

export const REGISTER_MAPS_DIR = 'src/modules/register-map/register-maps';

const READ_FUNCTIONS: ModbusFunctionName[] = [
    ModbusFunctionName.READ_COILS,
    ModbusFunctionName.READ_DISCRETE_INPUTS,
    ModbusFunctionName.READ_HOLDING_REGISTERS,
    ModbusFunctionName.READ_INPUT_REGISTERS
];

/**
 * Banc de test des modules Modbus à partir de leur table de registres (register-maps/*.json) :
 * expose les définitions au front et exécute une opération unitaire (validation de la saisie,
 * construction de la trame, décodage de la réponse).
 */
@Injectable()
export class RegisterMapService {
    private _templates?: RegisterMapTemplate[];
    // Formules des champs : moteur mathjs restreint de ModbusService
    private readonly _evaluate: FormulaEvaluator = (formula, scope) => this.modbusService.evaluateScale(formula, scope);

    public constructor(
        private readonly modbusService: ModbusService,
        private readonly deviceRepository: DeviceRepository,
        private readonly logger: Logger
    ) { }

    public list(): RegisterMapTemplate[] {
        if (!this._templates) {
            this._templates = this._loadTemplates();
        }
        return this._templates;
    }

    public getByKind(kind: DeviceKind): RegisterMapTemplate {
        const template = this.list().find((t) => t.kind === kind);
        if (!template) {
            throw new NotFoundException(`Aucune register map pour le kind ${kind}`);
        }
        return template;
    }

    public async getByDevice(deviceId: string): Promise<RegisterMapTemplate> {
        const device = await this.deviceRepository.get(deviceId) as DeviceModel;
        const kind = (device?.config as SlaveConfigModel)?.kind;
        if (!kind) {
            throw new NotFoundException(`Slave ${deviceId} introuvable ou sans kind`);
        }
        return this.getByKind(kind);
    }

    /** Traduit une opération + saisie en requête Modbus brute ; lève BadRequestException si la saisie est invalide */
    public buildRequest(template: RegisterMapTemplate, command: Omit<RegisterOperationCommand, 'deviceId'>): RegisterRequest {
        const { block, operation } = this._findOperation(template, command.blockId, command.operationId);
        if (block.danger && !command.isConfirmed) {
            throw new BadRequestException(`${block.id}.${operation.id} : opération sensible, isConfirmed=true requis`);
        }
        const request: RegisterRequest = {
            function: operation.function,
            address: block.address.start + this._channelOffset(block, operation, command.channel),
            length: operation.params?.length ?? 1
        };
        if (!READ_FUNCTIONS.includes(operation.function)) {
            request.value = RegisterValueEncoder.encode(template, operation, command.value);
        }
        return request;
    }

    /** Met en forme la réponse brute selon operation.result ; `scope` alimente les formules des champs */
    public decodeResult(
        template: RegisterMapTemplate,
        operation: RegisterOperation,
        raw: (number | boolean)[] | void,
        scope: Record<string, number> = {}
    ): DecodedValue {
        const result = operation.result ?? { type: 'echo' };
        const data = raw || [];
        switch (result.type) {
            case 'boolean[]':
            case 'enum[]':
                return this._decodeChannels(template, result, data);
            case 'fields':
                return { type: 'fields', fields: RegisterFieldDecoder.decodeAll(template, result.fields, data as number[], this._evaluate, scope) };
            case 'number':
                return { type: 'number', value: this._applyFormula(operation, Number(data[0])) };
            case 'version': {
                const value = this._applyFormula(operation, Number(data[0]));
                return { type: 'version', value, text: `${result.prefix ?? ''}${value.toFixed(result.decimals ?? 2)}` };
            }
            default:
                return { type: 'echo' };
        }
    }

    /** Exécute une opération sur un slave ; les erreurs Modbus/réseau sont renvoyées dans le résultat */
    public async execute(command: RegisterOperationCommand): Promise<RegisterOperationOutcome> {
        const template = await this.getByDevice(command.deviceId);
        const { operation } = this._findOperation(template, command.blockId, command.operationId);
        const request = this.buildRequest(template, command);
        const outcome: RegisterOperationOutcome = { isOk: false, blockId: command.blockId, operationId: command.operationId, request, durationMs: 0 };
        const start = Date.now();
        try {
            const scope = await this._resolveScope(command.deviceId, template, operation);
            if (Object.keys(scope).length) outcome.scope = scope;
            const raw = await this.modbusService.executeRegisterRequest(command.deviceId, request);
            outcome.raw = raw || undefined;
            outcome.value = this.decodeResult(template, operation, raw, scope);
            outcome.isOk = true;
        } catch (err) {
            outcome.error = this._toError(template, err);
            this.logger.warn({ ...command, request, err: err.message, modbusCode: err.modbusCode }, 'register map operation failed');
        }
        outcome.durationMs = Date.now() - start;
        return outcome;
    }

    /** Exécute les lectures scopeFrom et en extrait les valeurs numériques (ex: position décimale des totaliseurs) */
    private async _resolveScope(deviceId: string, template: RegisterMapTemplate, operation: RegisterOperation): Promise<Record<string, number>> {
        const scope: Record<string, number> = {};
        for (const ref of operation.scopeFrom ?? []) {
            const [blockId, operationId] = ref.split('.');
            const { operation: source } = this._findOperation(template, blockId, operationId);
            const raw = await this.modbusService.executeRegisterRequest(deviceId, this.buildRequest(template, { blockId, operationId }));
            const decoded = this.decodeResult(template, source, raw, scope);
            if (decoded.type === 'fields') {
                decoded.fields.filter((f) => typeof f.value === 'number').forEach((f) => scope[f.name] = f.value as number);
            }
        }
        return scope;
    }

    private _loadTemplates(): RegisterMapTemplate[] {
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        let files: string[];
        try {
            files = readdirSync(dir).filter((f) => f.endsWith('.json'));
        } catch (err) {
            this.logger.warn({ dir, err: err.message }, 'register maps directory not readable');
            return [];
        }
        return files.flatMap((file) => {
            try {
                const template = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RegisterMapTemplate;
                const errors = RegisterMapValidator.validate(template);
                if (errors.length) {
                    this.logger.error({ file, errors }, 'invalid register map skipped');
                    return [];
                }
                return [template];
            } catch (err) {
                this.logger.error({ file, err: err.message }, 'register map not parsable');
                return [];
            }
        });
    }

    private _findOperation(template: RegisterMapTemplate, blockId: string, operationId: string): BlockOperation {
        const block = template.registerMap.find((b) => b.id === blockId);
        const operation = block?.operations.find((o) => o.id === operationId);
        if (!operation) {
            throw new NotFoundException(`Opération ${blockId}.${operationId} inconnue pour ${template.kind}`);
        }
        return { block, operation };
    }

    // scope 'channel' : décalage = index × stride ; 'range'/'fixed' : adresse de départ du bloc
    private _channelOffset(block: RegisterBlock, operation: RegisterOperation, channel: number | undefined): number {
        if (operation.scope !== 'channel') {
            return 0;
        }
        if (!Number.isInteger(channel) || channel < 0 || channel >= block.address.count) {
            throw new BadRequestException(`channel doit être un entier entre 0 et ${block.address.count - 1}`);
        }
        return channel * (block.address.stride ?? 1);
    }

    private _toError(template: RegisterMapTemplate, err: { message: string; modbusCode?: number }): RegisterOperationError {
        const modbusCode = err.modbusCode;
        const exceptions = template.hardware.exceptionCodes ? template.enums[template.hardware.exceptionCodes] : undefined;
        const label = modbusCode !== undefined ? exceptions?.find((e) => e.value === modbusCode)?.label : undefined;
        return { message: err.message, modbusCode, label };
    }

    // Une entrée par voie, numérotée à partir de hardware.channels.labelStart
    private _decodeChannels(template: RegisterMapTemplate, result: ChannelResult, data: (number | boolean)[]): DecodedValue {
        const labelStart = template.hardware.channels?.labelStart ?? 1;
        const channels = data.map((v, index): DecodedChannel => {
            const value = result.type === 'boolean[]' ? Boolean(v) : Number(v);
            const channel: DecodedChannel = { index, number: labelStart + index, value };
            if (result.type === 'enum[]') channel.label = template.enums[result.enum]?.find((e) => e.value === value)?.label;
            return channel;
        });
        return { type: result.type, channels };
    }

    private _applyFormula(operation: RegisterOperation, raw: number): number {
        const formula = operation.params?.formula;
        return formula ? this.modbusService.evaluateScale(formula, { raw }) : raw;
    }
}
