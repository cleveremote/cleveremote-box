import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { RegisterMapInputError, RegisterMapNotFoundError } from '../errors/register-map.error';
import { ModbusConnection, ModbusTransport } from '../models/modbus-connection.model';
import {
    DecodedChannel, DecodedField, DecodedValue, OperationResult, READ_FUNCTIONS, RegisterBlock, RegisterMapTemplate, RegisterOperation,
    RegisterOperationCommand, RegisterOperationError, RegisterOperationOutcome, RegisterFunction, RegisterRawData, RegisterRequest
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


    public async testUltrasonicFlowMeter():Promise<void>{
      const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.203', port: 4196, unitId: 1 };
      const dir = join(process.cwd(), REGISTER_MAPS_DIR);
      const templates = readdirSync(dir).filter((f) => f.endsWith('.json'))
          .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate);
      const byKind = (kind: string): RegisterMapTemplate => templates.find((t) => t.kind === kind);
     
      let io8: RegisterMapTemplate; 
      io8 = byKind('DIGITAL_IO_8CH');
      let flowMeterTemplate = byKind('FLOWMETER_ULTRASONIC_V1');
      
      // Déverrouillage (REG0057) puis mise à l'heure du compteur
      const wpBefore = await this.execute(flowMeterTemplate, CONNECTION, { blockId: 'writeProtection', operationId: 'read', isConfirmed: true });
      this._printOutcome(wpBefore);
      const unlock = await this.execute(flowMeterTemplate, CONNECTION, { blockId: 'writeProtection', operationId: 'set', value: 12345, isConfirmed: true });
      this._printOutcome(unlock);
      const wpAfter = await this.execute(flowMeterTemplate, CONNECTION, { blockId: 'writeProtection', operationId: 'read', isConfirmed: true });
      this._printOutcome(wpAfter);

      const now = new Date();
      const setDate = await this.execute(flowMeterTemplate, CONNECTION, {
          blockId: 'calendar',
          operationId: 'set',
          value: {
              second:1,
              minute:1,
              hour: 1,
              day: 1,
              month: 1,
              year: 1,
          },
      });
      this._printOutcome(setDate);
      const checkDate = await this.execute(flowMeterTemplate, CONNECTION, { blockId: 'calendar', operationId: 'read' });
      this._printOutcome(checkDate);

      // Essai FC06 : mot de passe puis les 3 mots BCD de l'heure, un registre à la fois
      const words = setDate.request.value as number[];
      await this.modbusBus.execute(CONNECTION, { function: RegisterFunction.WRITE_SINGLE_REGISTER, address: 56, length: 1, value: 12345 });
      for (let i = 0; i < words.length; i++) {
          await this.modbusBus.execute(CONNECTION, { function: RegisterFunction.WRITE_SINGLE_REGISTER, address: 52 + i, length: 1, value: words[i] });
          console.log(`FC06 adresse ${52 + i} = 0x${words[i].toString(16)}`);
      }
      const checkDate06 = await this.execute(flowMeterTemplate, CONNECTION, { blockId: 'calendar', operationId: 'read' });
      this._printOutcome(checkDate06);


//        //await this.execute(io8, CONNECTION, { blockId: 'outputs', operationId: 'toggle', channel: 3 }); 
        // Tous les blocs 'fixed' du compteur ayant une opération read (ultrasonic-water-meter.json)
        const readBlockIds = [
            'commTest', 'units', 'waterMeter', 'heatMeter', 'instantaneous', 'totalizers', 'temperatures',
            'weekDay', 'calendar', 'autoSave', 'writeProtection', 'keyWrite', 'menuAccess', 'currentMenu',
            'deviceAddress', 'batchController', 'octPulses', 'errorCodes', 'sensorDiagnostics', 'signal',
            'runtimeStats', 'extraChannels', 'floatTotals', 'tariffs', 'periodTotals', 'historyPointers',
            'powerEvents', 'batteryVoltage', 'temperatureDifference', 'autoStorage', 'verification',
            'pipeDiameter', 'monthlyMax', 'meteringTimes', 'dailyMax', 'mbusUserCode', 'tariffSchedule',
        ];
        const outcomes = new Map<string, RegisterOperationOutcome>();
        for (const blockId of readBlockIds) {
            const outcome = await this.execute(flowMeterTemplate, CONNECTION, { blockId, operationId: 'read', isConfirmed: true });
            outcomes.set(blockId, outcome);
            this._printOutcome(outcome);
        }
        const historyPointers = outcomes.get('historyPointers');
        // dailyHistory / monthlyHistory sont en scope 'channel' : l'index du bloc vient de historyPointers
        const pointers = historyPointers.value?.type === 'fields' ? historyPointers.value.fields : [];
        const dailyPointer = Number(pointers.find((f) => f.name === 'dailyPointer')?.value ?? 0);
        const monthlyPointer = Number(pointers.find((f) => f.name === 'monthlyPointer')?.value ?? 0);
        const dailyHistory = await this.execute(flowMeterTemplate, CONNECTION, { blockId: 'dailyHistory', operationId: 'read', channel: 26 });
        const monthlyHistory = await this.execute(flowMeterTemplate, CONNECTION, { blockId: 'monthlyHistory', operationId: 'read', channel: monthlyPointer % 32 });
        this._printOutcome(dailyHistory);
        this._printOutcome(monthlyHistory);
    }

    /**
     * Lecture de toutes les opérations 'read' du variateur Veichi SI23 (veichi-si23-inverter.json) :
     * vues groupées puis un bloc par paramètre (F00.00 ... C02.46). Lecture seule, aucune écriture.
     * Les valeurs lues sont comparées à block.defaultValue (valeur usine du manuel).
     */
    public async testInverterSi23(): Promise<void> {
        // Variateur : unit id 1-10 (DEVICE_KIND_SPECS) ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.204', port: 4196, unitId: 1 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const inverterTemplate = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'INVERTER_VEICHI_SI23_V1');
        if (!inverterTemplate) {
            console.log('register map INVERTER_VEICHI_SI23_V1 introuvable');
            return;
        }

        // Toutes les lectures 'fixed' (les blocs 'channel', ex: parameterEeprom, n'ont pas de lecture)
        const readBlocks = inverterTemplate.registerMap
            .filter((b) => b.operations.some((o) => o.id === 'read' && o.scope === 'fixed'));
        const errors: string[] = [];
        const notDefault: string[] = [];
        for (const block of readBlocks) {
            const outcome = await this.execute(inverterTemplate, CONNECTION, { blockId: block.id, operationId: 'read', isConfirmed: true });
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                errors.push(`${block.id} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
                continue;
            }
            const first = outcome.value?.type === 'fields' ? outcome.value.fields[0] : undefined;
            if (block.defaultValue !== undefined && first && !this._isSameValue(first.value, block.defaultValue)) {
                notDefault.push(`${block.id} ${block.label} : lu ${first.text ?? first.value}${first.unit ? ` ${first.unit}` : ''}, usine ${block.defaultValue}`);
            }
        }

        console.log(`\n=== SI23 : ${readBlocks.length} lectures, ${readBlocks.length - errors.length} OK, ${errors.length} en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
        console.log(`\n=== SI23 : ${notDefault.length} paramètres différents de la valeur usine`);
        notDefault.forEach((d) => console.log(`  ${d}`));
    }

    // Valeur décodée vs valeur usine : nombres à 1e-6 près (mise à l'échelle), chaînes hexa à la casse près
    private _isSameValue(value: number | string, expected: number | string): boolean {
        if (typeof value === 'number' && typeof expected === 'number') {
            return Math.abs(value - expected) < 1e-6;
        }
        return String(value).toUpperCase() === String(expected).toUpperCase();
    }

    // Affichage console du résultat d'une opération, élément par élément selon operation.result
    private _printOutcome(outcome: RegisterOperationOutcome): void {
        console.log(`\n=== ${outcome.blockId}.${outcome.operationId} : ${outcome.isOk ? 'OK' : 'ERREUR'} (${outcome.durationMs} ms)`);
        console.log('request :', outcome.request);
        if (outcome.raw) {
            // Mots / bits bruts reçus du bus (mots aussi en hexa)
            const hex = outcome.raw.map((w) => (typeof w === 'number' ? `0x${w.toString(16).toUpperCase().padStart(4, '0')}` : String(w)));
            console.log(`raw     : [${outcome.raw.join(', ')}] [${hex.join(' ')}]`);
        }
        if (outcome.scopeFields?.length) {
            console.log('scope   :');
            outcome.scopeFields.forEach((f) => this._printField(f));
        }
        if (outcome.error) {
            const { message, modbusCode, label } = outcome.error;
            console.log(`error   : ${message}${modbusCode !== undefined ? ` [code ${modbusCode}${label ? ` - ${label}` : ''}]` : ''}`);
            return;
        }
        const value = outcome.value;
        switch (value?.type) {
            case 'fields':
                value.fields.forEach((f) => this._printField(f));
                break;
            case 'boolean[]':
            case 'enum[]':
                value.channels.forEach((c) => console.log(`  voie ${c.number} = ${c.label ?? c.value}`));
                break;
            case 'number':
                console.log(`  value = ${value.value}`);
                break;
            case 'version':
                console.log(`  version = ${value.text}`);
                break;
            default:
                console.log('  (echo)');
        }
    }

    private _printField(f: DecodedField): void {
        const display = f.text ?? `${f.value}${f.unit ? ` ${f.unit}` : ''}`;
        const flags = f.flags?.length ? ` flags=[${f.flags.join(', ')}]` : '';
        const expected = f.isExpected === false ? ' (inattendu)' : '';
        console.log(`  ${f.label} (${f.name}) = ${display}  [raw ${f.raw}]${flags}${expected}`);
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
            const { scope, fields: scopeFields } = await this._resolveScope(template, connection, operation);
            if (Object.keys(scope).length) outcome.scope = scope;
            if (scopeFields.length) outcome.scopeFields = scopeFields;
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
    ): Promise<{ scope: Record<string, number>; fields: DecodedField[] }> {
        const scope: Record<string, number> = {};
        const fields: DecodedField[] = [];
        for (const ref of operation.scopeFrom ?? []) {
            const [blockId, operationId] = ref.split('.');
            const { operation: source } = this.findOperation(template, blockId, operationId);
            const raw = await this.modbusBus.execute(connection, this.buildRequest(template, { blockId, operationId }));
            const decoded = this.decodeResult(template, source, raw, scope);
            if (decoded.type === 'fields') {
                fields.push(...decoded.fields);
                decoded.fields.filter((f) => typeof f.value === 'number').forEach((f) => scope[f.name] = f.value as number);
            }
        }
        return { scope, fields };
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
