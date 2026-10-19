import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { RegisterMapInputError, RegisterMapNotFoundError } from '../errors/register-map.error';
import { ModbusConnection, ModbusTransport } from '../models/modbus-connection.model';
import {
    DecodedChannel, DecodedValue, OperationResult, READ_FUNCTIONS, RegisterBlock, RegisterMapTemplate, RegisterOperation,
    RegisterOperationCommand, RegisterOperationError, RegisterOperationOutcome, RegisterRawData, RegisterRequest
} from '../models/register-map.model';
import { RegisterValueEncoder } from '../utils/register-map.util';
import { FormulaEvaluator, RegisterFieldDecoder } from '../utils/register-field.util';
import { FormulaEngine } from './formula-engine.service';
import { ModbusBusService } from './modbus-bus.service';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { REGISTER_MAPS_DIR } from './register-map-loader.service';

type ChannelResult = Extract<OperationResult, { type: 'boolean[]' | 'enum[]' }>;

export interface BlockOperation {
    block: RegisterBlock;
    operation: RegisterOperation;
}

/**
 * Banc de test des modules Modbus à partir de leur register map : validation de la saisie,
 * construction de la trame, exécution sur le bus et décodage de la réponse.
 * Entrées uniquement techniques ou liées au template (template, commande, connexion).
 */
@Injectable()
export class RegisterMapService {
    private readonly _evaluate: FormulaEvaluator = (formula, scope) => this.formulaEngine.evaluate(formula, scope);

    public constructor(
        private readonly modbusBus: ModbusBusService,
        private readonly formulaEngine: FormulaEngine,
        private readonly logger: Logger
    ) { }

    /** Lève RegisterMapNotFoundError si l'opération n'existe pas dans le template */
    public findOperation(template: RegisterMapTemplate, blockId: string, operationId: string): BlockOperation {
        const block = template.registerMap.find((b) => b.id === blockId);
        const operation = block?.operations.find((o) => o.id === operationId);
        if (!operation) {
            throw new RegisterMapNotFoundError(`Opération ${blockId}.${operationId} inconnue pour ${template.kind}`);
        }
        return { block, operation };
    }

    /** Traduit une opération + saisie en requête Modbus brute ; lève RegisterMapInputError si la saisie est invalide */
    public buildRequest(template: RegisterMapTemplate, command: RegisterOperationCommand): RegisterRequest {
        const { block, operation } = this.findOperation(template, command.blockId, command.operationId);
        if (block.danger && !command.isConfirmed) {
            throw new RegisterMapInputError(`${block.id}.${operation.id} : opération sensible, isConfirmed=true requis`);
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
        raw: RegisterRawData,
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


    public async tests():Promise<void>{
      const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, unitId: 62 };
      const dir = join(process.cwd(), REGISTER_MAPS_DIR);
      const templates = readdirSync(dir).filter((f) => f.endsWith('.json'))
          .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate);
      const byKind = (kind: string): RegisterMapTemplate => templates.find((t) => t.kind === kind);
     
      let io8: RegisterMapTemplate;
      io8 = byKind('DIGITAL_IO_8CH');

       await this.execute(io8, CONNECTION, { blockId: 'outputs', operationId: 'toggle', channel: 3 }); 
    }

    /**
     * Exécute une opération sur l'équipement joint par `connection`. Commande invalide : exception
     * (RegisterMapInputError / RegisterMapNotFoundError) ; erreurs Modbus/réseau : dans le résultat.
     */
    public async execute(
        template: RegisterMapTemplate,
        connection: ModbusConnection,
        command: RegisterOperationCommand
    ): Promise<RegisterOperationOutcome> {
        const { operation } = this.findOperation(template, command.blockId, command.operationId);
        const request = this.buildRequest(template, command);
        const outcome: RegisterOperationOutcome = { isOk: false, blockId: command.blockId, operationId: command.operationId, request, durationMs: 0 };
        const start = Date.now();
        try {
            const scope = await this._resolveScope(template, connection, operation);
            if (Object.keys(scope).length) outcome.scope = scope;
            const raw = await this.modbusBus.execute(connection, request);
            outcome.raw = raw || undefined;
            outcome.value = this.decodeResult(template, operation, raw, scope);
            outcome.isOk = true;
        } catch (err) {
            outcome.error = this._toError(template, err);
            this.logger.warn({ kind: template.kind, unitId: connection.unitId, ...command, request, err: err.message, modbusCode: err.modbusCode },
                'register map operation failed');
        }
        outcome.durationMs = Date.now() - start;
        return outcome;
    }

    /** Exécute les lectures scopeFrom et en extrait les valeurs numériques (ex: position décimale des totaliseurs) */
    private async _resolveScope(
        template: RegisterMapTemplate,
        connection: ModbusConnection,
        operation: RegisterOperation
    ): Promise<Record<string, number>> {
        const scope: Record<string, number> = {};
        for (const ref of operation.scopeFrom ?? []) {
            const [blockId, operationId] = ref.split('.');
            const { operation: source } = this.findOperation(template, blockId, operationId);
            const raw = await this.modbusBus.execute(connection, this.buildRequest(template, { blockId, operationId }));
            const decoded = this.decodeResult(template, source, raw, scope);
            if (decoded.type === 'fields') {
                decoded.fields.filter((f) => typeof f.value === 'number').forEach((f) => scope[f.name] = f.value as number);
            }
        }
        return scope;
    }

    // scope 'channel' : décalage = index × stride ; 'range'/'fixed' : adresse de départ du bloc
    private _channelOffset(block: RegisterBlock, operation: RegisterOperation, channel: number | undefined): number {
        if (operation.scope !== 'channel') {
            return 0;
        }
        if (!Number.isInteger(channel) || channel < 0 || channel >= block.address.count) {
            throw new RegisterMapInputError(`channel doit être un entier entre 0 et ${block.address.count - 1}`);
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
        return formula ? this.formulaEngine.evaluate(formula, { raw }) : raw;
    }
}
