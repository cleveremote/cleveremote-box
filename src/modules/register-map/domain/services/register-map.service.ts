import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { RegisterMapInputError, RegisterMapNotFoundError } from '../errors/register-map.error';
import { ModbusConnection, ModbusTransport } from '../models/modbus-connection.model';
import {
    DecodedChannel, DecodedField, DecodedValue, OperationRange, OperationResult, READ_FUNCTIONS, RegisterBlock, RegisterMapTemplate, RegisterOperation,
    RegisterOperationCommand, RegisterOperationError, RegisterOperationOutcome, RegisterOperationParams, RegisterFunction, RegisterRawData,
    RegisterRequest
} from '../models/register-map.model';
import { RegisterOperationDescriber, RegisterValueEncoder } from '../utils/register-map.util';
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

    /** Paramètres attendus par l'opération (voie, valeur, enums résolus) ; lève RegisterMapNotFoundError si elle n'existe pas */
    public describeParams(template: RegisterMapTemplate, blockId: string, operationId: string): RegisterOperationParams {
        const { block, operation } = this.findOperation(template, blockId, operationId);
        return RegisterOperationDescriber.describe(template, block, operation); 
    }

    /** Traduit une opération + saisie en requête Modbus brute ; lève RegisterMapInputError si la saisie est invalide */
    public buildRequest(template: RegisterMapTemplate, command: RegisterOperationCommand): RegisterRequest {
        const { block, operation } = this.findOperation(template, command.blockId, command.operationId);
        if (block.danger && !command.isConfirmed) {
            throw new RegisterMapInputError(`${block.id}.${operation.id} : opération sensible, isConfirmed=true requis`);
        }
        const range = this._range(operation, command.range);
        const request: RegisterRequest = {
            function: operation.function,
            address: block.address.start + this._channelOffset(block, operation, command.channel) + this._persistenceOffset(block, operation, command)
                + (range?.min ?? 0),
            length: range ? range.max - range.min + 1 : operation.params?.length ?? 1
        };
        if (!READ_FUNCTIONS.includes(operation.function)) {
            request.value = RegisterValueEncoder.encode(template, operation, command.value, range && request.length);
        }
        return request;
    }

    /**
     * Met en forme la réponse brute selon operation.result ; `scope` alimente les formules des champs ;
     * `first` : première voie lue (sous-plage d'une opération de scope 'range'), voies et champs décalés d'autant
     */
    public decodeResult(
        template: RegisterMapTemplate,
        operation: RegisterOperation,
        raw: RegisterRawData,
        scope: Record<string, number> = {},
        first = 0
    ): DecodedValue {
        const result = operation.result ?? { type: 'echo' };
        const data = raw || [];
        switch (result.type) {
            case 'boolean[]':
            case 'enum[]':
                return this._decodeChannels(template, result, data, first);
            case 'fields': {
                const fields = result.fields
                    .filter((f) => f.offset >= first && f.offset < first + data.length)
                    .map((f) => ({ ...f, offset: f.offset - first }));
                return { type: 'fields', fields: RegisterFieldDecoder.decodeAll(template, fields, data as number[], this._evaluate, scope) };
            }
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

    /**
     * Test du capteur de pression / niveau RS485 (pressure-level-transmitter.json) : toutes les lectures,
     * comparaison à la valeur usine et cohérence mesure entière / flottante. Lecture seule, aucune écriture.
     */
    public async testPressureSensor(): Promise<void> {
        // Capteur : unit id usine 1 (plage PRESSURE_V1 : 21-30) ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.201', port: 4196, unitId: 1 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const pressureTemplate = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'PRESSURE_V1');
        if (!pressureTemplate) {
            console.log('register map PRESSURE_V1 introuvable');
            return;
        }

        const readBlocks = pressureTemplate.registerMap
            .filter((b) => b.operations.some((o) => o.id === 'read' && o.scope === 'fixed'));
        const outcomes = new Map<string, RegisterOperationOutcome>();
        const errors: string[] = [];
        const notDefault: string[] = [];
        for (const block of readBlocks) {
            const outcome = await this.execute(pressureTemplate, CONNECTION, { blockId: block.id, operationId: 'read', isConfirmed: true });
            outcomes.set(block.id, outcome);
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                errors.push(`${block.id} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
                continue;
            }
            const first = outcome.value?.type === 'fields' ? outcome.value.fields[0] : undefined;
            if (block.defaultValue !== undefined && first && !this._isSameValue(first.raw, block.defaultValue)) {
                notDefault.push(`${block.id} ${block.label} : lu ${first.text ?? first.value}, usine ${block.defaultValue}`);
            }
        }

        // La mesure entière (0x0004, mise à l'échelle par decimalPoint) et la flottante (0x0016) doivent concorder
        const fieldOf = (blockId: string, name: string): DecodedField | undefined => {
            const value = outcomes.get(blockId)?.value;
            return value?.type === 'fields' ? value.fields.find((f) => f.name === name) : undefined;
        };
        const pv = fieldOf('pv', 'pv');
        const pvFloat = fieldOf('pvFloat', 'pvFloat');
        if (pv && pvFloat) {
            const gap = Math.abs(Number(pv.value) - Number(pvFloat.value));
            console.log(`\n=== Mesure : entière ${pv.value} / flottante ${pvFloat.value} ${pv.unit ?? ''} (écart ${gap})`);
        }

        console.log(`\n=== Capteur pression : ${readBlocks.length} lectures, ${readBlocks.length - errors.length} OK, ${errors.length} en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
        console.log(`\n=== Capteur pression : ${notDefault.length} paramètres différents de la valeur usine`);
        notDefault.forEach((d) => console.log(`  ${d}`)); 
    }

    /**
     * Test du capteur de sol Xidibei XDB1001-7 (xidibei-xdb1001-7-soil-sensor.json) : toutes les lectures,
     * comparaison à la valeur usine, cohérence vue groupée / blocs unitaires et diagnostic des adresses NPK.
     * Lecture seule, aucune écriture.
     */
    public async testSoilSensor(): Promise<void> {
        // Capteur : unit id usine 1 (plage EC_METER_V1 : 31-40), série 4800 8N1 ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.202', port: 4196, unitId: 1 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const soilTemplate = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'EC_METER_V1');
        if (!soilTemplate) {
            console.log('register map EC_METER_V1 introuvable'); 
            return;
        }

        const readBlocks = soilTemplate.registerMap
            .filter((b) => b.operations.some((o) => o.id === 'read' && o.scope === 'fixed'));
        const outcomes = new Map<string, RegisterOperationOutcome>();
        const errors: string[] = [];
        const notDefault: string[] = [];
        for (const block of readBlocks) {
            const outcome = await this.execute(soilTemplate, CONNECTION, { blockId: block.id, operationId: 'read', isConfirmed: true });
            outcomes.set(block.id, outcome);
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                errors.push(`${block.id} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
                continue;
            }
            const first = outcome.value?.type === 'fields' ? outcome.value.fields[0] : undefined;
            if (block.defaultValue !== undefined && first && !this._isSameValue(first.raw, block.defaultValue)) {
                notDefault.push(`${block.id} ${block.label} : lu ${first.text ?? first.value}, usine ${block.defaultValue}`);
            }
        }

        const fieldOf = (blockId: string, name: string): DecodedField | undefined => {
            const value = outcomes.get(blockId)?.value;
            return value?.type === 'fields' ? value.fields.find((f) => f.name === name) : undefined;
        };

        // La vue groupée (0x0000-0x0003) et les blocs unitaires doivent concorder (lectures successives : faible écart possible)
        console.log('\n=== Capteur sol : vue groupée / blocs unitaires');
        for (const name of ['moisture', 'temperature', 'conductivity', 'ph']) {
            const grouped = fieldOf('monitoring', name);
            const single = fieldOf(name, name);
            if (grouped && single) {
                console.log(`  ${name} : groupé ${grouped.value} / unitaire ${single.value} ${single.unit ?? ''}`);
            }
        }

        // Doc incohérente pour P et K : 0x0007/0x0008 (colonne hexa) ou 0x0005/0x0006 (colonne PLC)
        const scan = outcomes.get('nutrientsScan');
        console.log('\n=== Capteur sol : diagnostic adresses NPK');
        if (scan?.isOk && scan.value?.type === 'fields') {
            scan.value.fields.forEach((f) => console.log(`  ${f.label} = ${f.value}`));
        } else {
            console.log(`  0x0004-0x0008 illisible (${scan?.error?.label ?? scan?.error?.message}) : 0x0005/0x0006 probablement absents, adresses hexa retenues`);
        }

        console.log(`\n=== Capteur sol : ${readBlocks.length} lectures, ${readBlocks.length - errors.length} OK, ${errors.length} en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
        console.log(`\n=== Capteur sol : ${notDefault.length} paramètres différents de la valeur usine`);
        notDefault.forEach((d) => console.log(`  ${d}`));
    }

    /**
     * Test de la sonde température / humidité ComWinTop CWT-TH (comwintop-cwt-th-sensor.json) : toutes les lectures,
     * comparaison à la valeur usine et cohérence vues groupées / blocs unitaires. Lecture seule, aucune écriture.
     */
    public async testTemperatureMoistureSensor(): Promise<void> {
        // Sonde : unit id usine 1 (plage TEMPERATURE_MOISTURE_V1 : 51-60), série 4800 8N1 ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.202', port: 4196, unitId: 1 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const thTemplate = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'TEMPERATURE_MOISTURE_V1');
        if (!thTemplate) {
            console.log('register map TEMPERATURE_MOISTURE_V1 introuvable');
            return;
        }

        const readBlocks = thTemplate.registerMap
            .filter((b) => b.operations.some((o) => o.id === 'read' && o.scope === 'fixed'));
        const outcomes = new Map<string, RegisterOperationOutcome>();
        const errors: string[] = [];
        const notDefault: string[] = [];
        for (const block of readBlocks) {
            const outcome = await this.execute(thTemplate, CONNECTION, { blockId: block.id, operationId: 'read', isConfirmed: true });
            outcomes.set(block.id, outcome);
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                errors.push(`${block.id} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
                continue;
            }
            const first = outcome.value?.type === 'fields' ? outcome.value.fields[0] : undefined;
            if (block.defaultValue !== undefined && first && !this._isSameValue(first.raw, block.defaultValue)) {
                notDefault.push(`${block.id} ${block.label} : lu ${first.text ?? first.value}${first.unit ? ` ${first.unit}` : ''}, usine ${block.defaultValue}`);
            }
        }

        const fieldOf = (blockId: string, name: string): DecodedField | undefined => {
            const value = outcomes.get(blockId)?.value;
            return value?.type === 'fields' ? value.fields.find((f) => f.name === name) : undefined;
        };

        // Les vues groupées et les blocs unitaires doivent concorder (lectures successives : faible écart possible sur les mesures)
        console.log('\n=== Sonde T/H : vues groupées / blocs unitaires');
        const pairs: [string, string][] = [
            ['monitoring', 'humidity'], ['monitoring', 'temperature'],
            ['calibration', 'temperatureCalibration'], ['calibration', 'humidityCalibration'],
        ];
        for (const [groupId, name] of pairs) {
            const grouped = fieldOf(groupId, name);
            const single = fieldOf(name, name);
            if (grouped && single) {
                console.log(`  ${name} : groupé ${grouped.value} / unitaire ${single.value} ${single.unit ?? ''}`);
            }
        }

        console.log(`\n=== Sonde T/H : ${readBlocks.length} lectures, ${readBlocks.length - errors.length} OK, ${errors.length} en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
        console.log(`\n=== Sonde T/H : ${notDefault.length} paramètres différents de la valeur usine`);
        notDefault.forEach((d) => console.log(`  ${d}`));
    }

    /**
     * Test du débitmètre RS485 (flowmeter-rs485.json) : toutes les lectures, comparaison à la valeur usine,
     * contrôle de l'identifiant 0x2022 et cohérence vues groupées / blocs unitaires. Lecture seule, aucune écriture.
     */
    public async testFlowMeter(): Promise<void> {
        // Débitmètre : unit id usine 255 (plage FLOWMETER_V1 : 11-20), série 115200 8N1 en usine ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, unitId: 12 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const flowMeterTemplate = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'FLOWMETER_V1');
        if (!flowMeterTemplate) {
            console.log('register map FLOWMETER_V1 introuvable');
            return;
        }

        const readBlocks = flowMeterTemplate.registerMap
            .filter((b) => b.operations.some((o) => o.id === 'read' && o.scope === 'fixed'));
        const outcomes = new Map<string, RegisterOperationOutcome>();
        const errors: string[] = [];
        const notDefault: string[] = [];
        for (const block of readBlocks) {
            const outcome = await this.execute(flowMeterTemplate, CONNECTION, { blockId: block.id, operationId: 'read', isConfirmed: true });
            outcomes.set(block.id, outcome);
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                errors.push(`${block.id} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
                continue;
            }
            const first = outcome.value?.type === 'fields' ? outcome.value.fields[0] : undefined;
            if (block.defaultValue !== undefined && first && !this._isSameValue(first.raw, block.defaultValue)) {
                notDefault.push(`${block.id} ${block.label} : lu ${first.text ?? first.value}${first.unit ? ` ${first.unit}` : ''}, usine ${block.defaultValue}`);
            }
        }

        const fieldOf = (blockId: string, name: string): DecodedField | undefined => {
            const value = outcomes.get(blockId)?.value;
            return value?.type === 'fields' ? value.fields.find((f) => f.name === name) : undefined;
        };

        // L'identifiant du modèle est toujours 0x2022 (8226) : sinon mauvais équipement ou mauvais décodage
        const modelId = fieldOf('modelId', 'modelId');
        if (modelId) {
            const isExpected = this._isSameValue(modelId.raw, 8226);
            console.log(`\n=== Débitmètre : identifiant 0x${Number(modelId.raw).toString(16)} ${isExpected ? 'OK' : '(attendu 0x2022)'}`);
        }

        // Les vues groupées et les blocs unitaires doivent concorder (lectures successives : faible écart possible sur les mesures)
        console.log('\n=== Débitmètre : vues groupées / blocs unitaires');
        const pairs: [string, string][] = [
            ['monitoring', 'instantFlow'], ['monitoring', 'totalFlow'], ['monitoring', 'pressure'],
            ['configuration', 'modelId'], ['configuration', 'baudRate'], ['configuration', 'deviceAddress'], ['configuration', 'kFactor'],
        ];
        for (const [groupId, name] of pairs) {
            const grouped = fieldOf(groupId, name);
            const single = fieldOf(name, name);
            if (grouped && single) {
                console.log(`  ${name} : groupé ${grouped.text ?? grouped.value} / unitaire ${single.text ?? single.value} ${single.unit ?? ''}`);
            }
        }

        console.log(`\n=== Débitmètre : ${readBlocks.length} lectures, ${readBlocks.length - errors.length} OK, ${errors.length} en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
        console.log(`\n=== Débitmètre : ${notDefault.length} paramètres différents de la valeur usine`);
        notDefault.forEach((d) => console.log(`  ${d}`));
    }

    /**
     * Test de toutes les opérations du module Waveshare Modbus RTU IO 8CH (waveshare-modbus-rtu-io-8ch.json) :
     * lectures, pilotage des sorties (unitaire, masque, toggle, toutes, flash ON/OFF), modes de contrôle,
     * puis réécriture à l'identique de l'adresse et des paramètres UART. Chaque écriture est vérifiée par relecture.
     * ATTENTION : les sorties commutent réellement ; états et modes initiaux restaurés en fin de test.
     */
    public async testIo8Channel(): Promise<void> {
        // Module : unit id 61-70 (DEVICE_KIND_SPECS), série 9600 8N1 ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, unitId: 62 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const io8 = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'DIGITAL_IO_8CH');
        if (!io8) {
            console.log('register map DIGITAL_IO_8CH introuvable');
            return;
        }

        const count = io8.hardware.channels?.outputs ?? 8;
        const errors: string[] = [];
        const checks: string[] = [];
        const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
        const run = async (command: RegisterOperationCommand): Promise<RegisterOperationOutcome> => {
            const outcome = await this.execute(io8, CONNECTION, { isConfirmed: true, ...command });
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                const channel = command.channel !== undefined ? ` voie ${command.channel}` : '';
                errors.push(`${command.blockId}.${command.operationId}${channel} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
            }
            return outcome;
        };
        const readChannels = async (blockId: string): Promise<(number | boolean)[] | undefined> => {
            const value = (await run({ blockId, operationId: 'read' })).value;
            return value?.type === 'boolean[]' || value?.type === 'enum[]' ? value.channels.map((c) => c.value) : undefined;
        };
        // Relecture des sorties (ou des modes) et comparaison à l'état attendu
        const expectChannels = async (label: string, blockId: string, expected: (number | boolean)[]): Promise<void> => {
            const actual = await readChannels(blockId);
            const isOk = !!actual && expected.every((v, i) => Number(v) === Number(actual[i]));
            const show = (values: (number | boolean)[]): string => values.map(Number).join('');
            checks.push(`${isOk ? 'OK    ' : 'ECHEC '} ${label} : attendu ${show(expected)}, lu ${actual ? show(actual) : '-'}`);
        };
        const fill = <T>(value: T): T[] => Array.from({ length: count }, () => value);

        // Identification et état initial (restauré en fin de test)
        await run({ blockId: 'version', operationId: 'read' });
        const address = await run({ blockId: 'deviceAddress', operationId: 'read' });
        await run({ blockId: 'inputs', operationId: 'read' });
        const initialOutputs = await readChannels('outputs');
        const initialModes = await readChannels('outputModes');

        // Mode Normal : en Linkage / Toggle / Edge, les entrées modifieraient les sorties pendant le test
        await run({ blockId: 'outputModes', operationId: 'setAll', value: fill(0) });
        await expectChannels('outputModes.setAll Normal', 'outputModes', fill(0));

        // allOutputs : ON, OFF, TOGGLE
        await run({ blockId: 'allOutputs', operationId: 'set', value: 1 });
        await expectChannels('allOutputs.set ON', 'outputs', fill(true));
        await run({ blockId: 'allOutputs', operationId: 'set', value: 0 });
        await expectChannels('allOutputs.set OFF', 'outputs', fill(false));
        await run({ blockId: 'allOutputs', operationId: 'toggle' });
        await expectChannels('allOutputs.toggle', 'outputs', fill(true));
        await run({ blockId: 'allOutputs', operationId: 'set', value: 0 });

        // outputs.set / outputs.toggle voie par voie (une seule sortie active à la fois)
        for (let channel = 0; channel < count; channel++) {
            const only = fill(false).map((_, i) => i === channel);
            await run({ blockId: 'outputs', operationId: 'set', channel, value: 1 });
            await expectChannels(`outputs.set CH${channel + 1} ON`, 'outputs', only);
            await run({ blockId: 'outputs', operationId: 'set', channel, value: 0 });
            await expectChannels(`outputs.set CH${channel + 1} OFF`, 'outputs', fill(false));
            await run({ blockId: 'outputs', operationId: 'toggle', channel });
            await expectChannels(`outputs.toggle CH${channel + 1} (OFF -> ON)`, 'outputs', only);
            await run({ blockId: 'outputs', operationId: 'toggle', channel });
            await expectChannels(`outputs.toggle CH${channel + 1} (ON -> OFF)`, 'outputs', fill(false));
        }

        // outputs.setMask puis outputs.toggleRange (inversion du masque)
        const mask = fill(false).map((_, i) => i % 2 === 0); 
        await run({ blockId: 'outputs', operationId: 'setMask', value: mask });
        await expectChannels('outputs.setMask 10101010', 'outputs', mask);
        await run({ blockId: 'outputs', operationId: 'toggleRange' });
        await expectChannels('outputs.toggleRange', 'outputs', mask.map((v) => !v));
        await run({ blockId: 'outputs', operationId: 'setMask', value: fill(false) });
        await expectChannels('outputs.setMask 00000000', 'outputs', fill(false));

        // flashOn / flashOff : 7 × 100 ms, relecture pendant puis après l'impulsion
        for (let channel = 0; channel < count; channel++) {
            const only = fill(false).map((_, i) => i === channel);
            await run({ blockId: 'flashOn', operationId: 'pulse', channel, value: 7 });
            await expectChannels(`flashOn.pulse CH${channel + 1} pendant`, 'outputs', only);
            await wait(1200);
            await expectChannels(`flashOn.pulse CH${channel + 1} après`, 'outputs', fill(false));

            await run({ blockId: 'outputs', operationId: 'set', channel, value: 1 });
            await run({ blockId: 'flashOff', operationId: 'pulse', channel, value: 7 });
            await expectChannels(`flashOff.pulse CH${channel + 1} pendant`, 'outputs', fill(false));
            await wait(1200);
            await expectChannels(`flashOff.pulse CH${channel + 1} après`, 'outputs', only);
            await run({ blockId: 'outputs', operationId: 'set', channel, value: 0 });
        }

        // outputModes.set : chaque mode sur chaque voie, puis setAll avec un mode différent par voie
        const modes = io8.enums.outputMode.map((e) => e.value);
        for (let channel = 0; channel < count; channel++) {
            for (const mode of modes) {
                await run({ blockId: 'outputModes', operationId: 'set', channel, value: mode });
                await expectChannels(`outputModes.set CH${channel + 1} = ${mode}`, 'outputModes', fill(0).map((_, i) => (i === channel ? mode : 0)));
            }
            await run({ blockId: 'outputModes', operationId: 'set', channel, value: 0 });
        }
        const mixedModes = fill(0).map((_, i) => modes[i % modes.length]);
        await run({ blockId: 'outputModes', operationId: 'setAll', value: mixedModes });
        await expectChannels(`outputModes.setAll ${mixedModes.join('')}`, 'outputModes', mixedModes);

        // Opérations sensibles réécrites à l'identique : adresse courante, UART 9600 N (hardware.serial)
        const currentAddress = address.value?.type === 'number' ? address.value.value : undefined;
        if (currentAddress !== undefined) {
            await run({ blockId: 'deviceAddress', operationId: 'set', value: currentAddress });
            const after = await run({ blockId: 'deviceAddress', operationId: 'read' });
            const readBack = after.value?.type === 'number' ? after.value.value : undefined;
            checks.push(`${readBack === currentAddress ? 'OK    ' : 'ECHEC '} deviceAddress.set ${currentAddress} : lu ${readBack ?? '-'}`);
        } else {
            checks.push('ECHEC  deviceAddress.set : adresse courante illisible, écriture non tentée');
        }
        await run({ blockId: 'uart', operationId: 'set', value: { parity: 0, baudRate: 1 } });
        const version = await run({ blockId: 'version', operationId: 'read' });
        checks.push(`${version.isOk ? 'OK    ' : 'ECHEC '} uart.set 9600 N : communication ${version.isOk ? 'maintenue' : 'perdue'}`);

        // Restauration : modes d'abord (sinon Linkage écraserait les sorties), puis sorties
        if (initialModes) {
            await run({ blockId: 'outputModes', operationId: 'setAll', value: initialModes });
        }
        if (initialOutputs) {
            await run({ blockId: 'outputs', operationId: 'setMask', value: initialOutputs });
        }

        const failed = checks.filter((c) => c.startsWith('ECHEC'));
        console.log(`\n=== IO 8CH : ${checks.length} vérifications, ${checks.length - failed.length} OK, ${failed.length} en échec`);
        checks.forEach((c) => console.log(`  ${c}`));
        console.log(`\n=== IO 8CH : ${errors.length} opérations en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
    }

    /**
     * Test de toutes les opérations du module Waveshare Modbus RTU Analog Input 8CH (waveshare-modbus-rtu-analog-input-8ch.json) :
     * lectures (groupée / voie par voie), chaque type de plage sur les 8 voies (setAll) puis voie par voie (set),
     * réécriture à l'identique de l'adresse et des paramètres UART. Chaque écriture est vérifiée par relecture.
     * Les cavaliers tension / courant étant matériels, seules les bornes des mesures sont contrôlées.
     * Types de plage initiaux restaurés en fin de test.
     */
    public async testAnalogInput8Channel(): Promise<void> {
        // Module : unit id 81-90 (DEVICE_KIND_SPECS), série 9600 8N1 ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, unitId: 81 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const ai8 = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'ANALOG_INPUT_8CH');
        if (!ai8) {
            console.log('register map ANALOG_INPUT_8CH introuvable');
            return;
        }

        const count = ai8.hardware.channels?.inputs ?? 8;
        const errors: string[] = [];
        const checks: string[] = [];
        const infos: string[] = [];
        const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
        const run = async (command: RegisterOperationCommand): Promise<RegisterOperationOutcome> => {
            const outcome = await this.execute(ai8, CONNECTION, { isConfirmed: true, ...command });
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                const channel = command.channel !== undefined ? ` voie ${command.channel}` : '';
                errors.push(`${command.blockId}.${command.operationId}${channel} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
            }
            return outcome;
        };
        const fieldsOf = (outcome: RegisterOperationOutcome): DecodedField[] => (outcome.value?.type === 'fields' ? outcome.value.fields : []);
        const check = (label: string, isOk: boolean): void => {
            checks.push(`${isOk ? 'OK    ' : 'ECHEC '} ${label}`);
        };
        const readRanges = async (): Promise<number[] | undefined> => {
            const fields = fieldsOf(await run({ blockId: 'inputRanges', operationId: 'read' }));
            return fields.length ? fields.map((f) => Number(f.raw)) : undefined;
        };
        // Relecture des types de plage et comparaison à l'état attendu
        const expectRanges = async (label: string, expected: number[]): Promise<void> => {
            const actual = await readRanges();
            const isOk = !!actual && expected.every((v, i) => v === actual[i]);
            check(`${label} : attendu ${expected.join('')}, lu ${actual ? actual.join('') : '-'}`, isOk);
        };
        const fill = <T>(value: T): T[] => Array.from({ length: count }, () => value);
        const codes = ai8.enums.inputRange.map((e) => e.value);
        const rangeLabel = (code: number): string => ai8.enums.inputRange.find((e) => e.value === code)?.label ?? String(code);
        const rangeUnit = (code: number): string | undefined => ai8.enums.inputRangeUnit.find((e) => e.value === code)?.label;
        // Valeur maximale par type de plage (bornes de la version B 0-10 V, qui couvrent la version A 0-5 V)
        const maxByRange: Record<number, number> = { 0: 10000, 1: 10000, 2: 20000, 3: 20000, 4: 4095 };

        // Identification et état initial (types de plage restaurés en fin de test)
        await run({ blockId: 'version', operationId: 'read' });
        const address = await run({ blockId: 'deviceAddress', operationId: 'read' });
        const uart = fieldsOf(await run({ blockId: 'uart', operationId: 'read' }));
        const initialRanges = await readRanges();

        // Lecture groupée / voie par voie : lectures successives, faible écart possible sur des signaux vivants
        const grouped = fieldsOf(await run({ blockId: 'inputs', operationId: 'read' }));
        for (let channel = 0; channel < count; channel++) {
            const single = await run({ blockId: 'inputs', operationId: 'readChannel', channel });
            const value = single.value?.type === 'number' ? single.value.value : '-';
            const field = grouped[channel];
            infos.push(`CH${channel + 1} : groupé ${field?.value ?? '-'} / unitaire ${value} ${field?.unit ?? ''}`);
        }

        // Chaque type de plage sur les 8 voies : relecture des plages, unité appliquée et mesures dans les bornes
        for (const code of codes) {
            await run({ blockId: 'inputRanges', operationId: 'setAll', value: fill(code) });
            await expectRanges(`inputRanges.setAll ${rangeLabel(code)}`, fill(code));
            // Laisse le module convertir avec la nouvelle plage
            await wait(500);
            const fields = fieldsOf(await run({ blockId: 'inputs', operationId: 'read' }));
            const values = fields.map((f) => Number(f.value));
            const isInRange = fields.length === count && values.every((v) => v <= maxByRange[code]);
            const isUnitOk = fields.every((f) => f.unit === rangeUnit(code));
            check(`inputs.read en ${rangeLabel(code)} : [${values.join(' ')}] ${fields[0]?.unit ?? ''} (max ${maxByRange[code]}${isUnitOk ? '' : ', unité incorrecte'})`, isInRange && isUnitOk);
        }

        // inputRanges.set : chaque type de plage sur chaque voie, les autres voies restant sur la plage de base
        const base = codes[0];
        await run({ blockId: 'inputRanges', operationId: 'setAll', value: fill(base) });
        for (let channel = 0; channel < count; channel++) {
            for (const code of codes.filter((c) => c !== base)) {
                await run({ blockId: 'inputRanges', operationId: 'set', channel, value: code });
                await expectRanges(`inputRanges.set CH${channel + 1} = ${rangeLabel(code)}`, fill(base).map((_, i) => (i === channel ? code : base)));
            }
            await run({ blockId: 'inputRanges', operationId: 'set', channel, value: base });
        }

        // Opérations sensibles réécrites à l'identique : adresse et paramètres UART courants
        const currentAddress = address.value?.type === 'number' ? address.value.value : undefined;
        if (currentAddress !== undefined) {
            await run({ blockId: 'deviceAddress', operationId: 'set', value: currentAddress });
            const after = await run({ blockId: 'deviceAddress', operationId: 'read' });
            const readBack = after.value?.type === 'number' ? after.value.value : undefined;
            check(`deviceAddress.set ${currentAddress} : lu ${readBack ?? '-'}`, readBack === currentAddress);
        } else {
            check('deviceAddress.set : adresse courante illisible, écriture non tentée', false);
        }
        const parity = uart.find((f) => f.name === 'parity')?.value;
        const baudRate = uart.find((f) => f.name === 'baudRate')?.value;
        if (typeof parity === 'number' && typeof baudRate === 'number') {
            const setting = `${ai8.enums.baudRate.find((e) => e.value === baudRate)?.label ?? baudRate} ${ai8.enums.parity.find((e) => e.value === parity)?.label ?? parity}`;
            await run({ blockId: 'uart', operationId: 'set', value: { parity, baudRate } });
            const version = await run({ blockId: 'version', operationId: 'read' });
            check(`uart.set ${setting} : communication ${version.isOk ? 'maintenue' : 'perdue'}`, version.isOk);
        } else {
            check('uart.set : paramètres UART courants illisibles, écriture non tentée', false);
        }

        // Restauration des types de plage initiaux (codes hors enum : non réécrits)
        if (initialRanges?.every((c) => codes.includes(c))) {
            await run({ blockId: 'inputRanges', operationId: 'setAll', value: initialRanges });
            await expectRanges('inputRanges restauration', initialRanges);
        }

        console.log('\n=== AI 8CH : lecture groupée / voie par voie');
        infos.forEach((i) => console.log(`  ${i}`));
        const failed = checks.filter((c) => c.startsWith('ECHEC'));
        console.log(`\n=== AI 8CH : ${checks.length} vérifications, ${checks.length - failed.length} OK, ${failed.length} en échec`);
        checks.forEach((c) => console.log(`  ${c}`));
        console.log(`\n=== AI 8CH : ${errors.length} opérations en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
    }

    /**
     * Test de toutes les opérations du module Waveshare Modbus RTU Analog Output 8CH (B) (waveshare-modbus-rtu-analog-output-8ch-b.json) :
     * lectures (groupée / voie par voie), consignes sur les 8 voies (setAll) puis voie par voie (set), refus des consignes
     * hors plage, réécriture à l'identique de l'adresse et des paramètres UART. Chaque écriture est vérifiée par relecture.
     * ATTENTION : les sorties délivrent réellement jusqu'à `maxMv` ; consignes initiales restaurées en fin de test.
     */
    public async testAnalogOutput8Channel(): Promise<void> {
        // Module : unit id 71-80 (DEVICE_KIND_SPECS), série 9600 8N1 ; adapter host/port/unitId au montage réel
        const CONNECTION: ModbusConnection = { transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, unitId: 2 };
        const dir = join(process.cwd(), REGISTER_MAPS_DIR);
        const ao8 = readdirSync(dir).filter((f) => f.endsWith('.json'))
            .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RegisterMapTemplate)
            .find((t) => t.kind === 'ANALOG_OUTPUT_8CH');
        if (!ao8) {
            console.log('register map ANALOG_OUTPUT_8CH introuvable');
            return;
        }

        const count = ao8.hardware.channels?.outputs ?? 8;
        const errors: string[] = [];
        const checks: string[] = [];
        const run = async (command: RegisterOperationCommand): Promise<RegisterOperationOutcome> => {
            const outcome = await this.execute(ao8, CONNECTION, { isConfirmed: true, ...command });
            this._printOutcome(outcome);
            if (!outcome.isOk) {
                const channel = command.channel !== undefined ? ` voie ${command.channel}` : '';
                errors.push(`${command.blockId}.${command.operationId}${channel} : ${outcome.error?.message}${outcome.error?.label ? ` (${outcome.error.label})` : ''}`);
            }
            return outcome;
        };
        const fieldsOf = (outcome: RegisterOperationOutcome): DecodedField[] => (outcome.value?.type === 'fields' ? outcome.value.fields : []);
        const check = (label: string, isOk: boolean): void => {
            checks.push(`${isOk ? 'OK    ' : 'ECHEC '} ${label}`);
        };
        const readOutputs = async (): Promise<number[] | undefined> => {
            const fields = fieldsOf(await run({ blockId: 'outputs', operationId: 'read' }));
            return fields.length ? fields.map((f) => Number(f.raw)) : undefined;
        };
        // Relecture des consignes et comparaison à l'état attendu
        const expectOutputs = async (label: string, expected: number[]): Promise<void> => {
            const actual = await readOutputs();
            const isOk = !!actual && expected.every((v, i) => v === actual[i]);
            check(`${label} : attendu [${expected.join(' ')}], lu [${actual ? actual.join(' ') : '-'}] mV`, isOk);
        };
        // Saisie hors plage : doit être refusée par le template avant toute émission sur le bus
        const expectRejected = (label: string, command: RegisterOperationCommand): void => {
            try {
                this.buildRequest(ao8, { isConfirmed: true, ...command });
                check(`${label} : refus attendu, requête construite`, false);
            } catch (err) {
                check(`${label} : refusé (${err.message})`, err instanceof RegisterMapInputError);
            }
        };
        const fill = <T>(value: T): T[] => Array.from({ length: count }, () => value);
        const setInput = this.findOperation(ao8, 'outputs', 'set').operation.input;
        // Consigne max des essais (plage du template, 10 V) : la réduire si un équipement est raccordé aux sorties
        const maxMv = setInput?.type === 'number' ? setInput.max : 10000;
        const minMv = setInput?.type === 'number' ? setInput.min : 0;

        // Identification et état initial (consignes restaurées en fin de test)
        await run({ blockId: 'version', operationId: 'read' });
        const address = await run({ blockId: 'deviceAddress', operationId: 'read' });
        const uart = fieldsOf(await run({ blockId: 'uart', operationId: 'read' }));
        const initialOutputs = await readOutputs();

        // outputs.setAll : bornes, mi-plage et rampe (valeur différente par voie), relecture groupée
        const ramp = fill(0).map((_, i) => Math.round(minMv + ((maxMv - minMv) * (i + 1)) / count));
        const patterns: [string, number[]][] = [
            ['min', fill(minMv)], ['max', fill(maxMv)], ['mi-plage', fill(Math.round((minMv + maxMv) / 2))], ['rampe', ramp]
        ];
        for (const [label, values] of patterns) {
            await run({ blockId: 'outputs', operationId: 'setAll', value: values });
            await expectOutputs(`outputs.setAll ${label}`, values);
        }

        // outputs.readChannel : chaque voie doit relire la consigne de la rampe
        for (let channel = 0; channel < count; channel++) {
            const single = await run({ blockId: 'outputs', operationId: 'readChannel', channel });
            const value = single.value?.type === 'number' ? single.value.value : undefined;
            check(`outputs.readChannel CH${channel + 1} : attendu ${ramp[channel]}, lu ${value ?? '-'} mV`, value === ramp[channel]);
        }

        // outputs.set : une voie à la fois (consigne propre à la voie), les autres restant au min
        await run({ blockId: 'outputs', operationId: 'setAll', value: fill(minMv) });
        for (let channel = 0; channel < count; channel++) {
            await run({ blockId: 'outputs', operationId: 'set', channel, value: ramp[channel] });
            await expectOutputs(`outputs.set CH${channel + 1} = ${ramp[channel]} mV`, fill(minMv).map((v, i) => (i === channel ? ramp[channel] : v)));
            await run({ blockId: 'outputs', operationId: 'set', channel, value: minMv });
        }

        // Saisies hors plage : refusées par le template
        expectRejected(`outputs.set ${maxMv + 1} mV`, { blockId: 'outputs', operationId: 'set', channel: 0, value: maxMv + 1 });
        expectRejected(`outputs.set ${minMv - 1} mV`, { blockId: 'outputs', operationId: 'set', channel: 0, value: minMv - 1 });
        expectRejected(`outputs.set CH${count + 1}`, { blockId: 'outputs', operationId: 'set', channel: count, value: minMv });
        expectRejected(`outputs.setAll ${count - 1} valeurs`, { blockId: 'outputs', operationId: 'setAll', value: fill(minMv).slice(1) });
        expectRejected(`outputs.setAll avec ${maxMv + 1} mV`, { blockId: 'outputs', operationId: 'setAll', value: fill(minMv).map((v, i) => (i === 0 ? maxMv + 1 : v)) });

        // Opérations sensibles réécrites à l'identique : adresse et paramètres UART courants
        const currentAddress = address.value?.type === 'number' ? address.value.value : undefined;
        if (currentAddress !== undefined) {
            await run({ blockId: 'deviceAddress', operationId: 'set', value: currentAddress });
            const after = await run({ blockId: 'deviceAddress', operationId: 'read' });
            const readBack = after.value?.type === 'number' ? after.value.value : undefined;
            check(`deviceAddress.set ${currentAddress} : lu ${readBack ?? '-'}`, readBack === currentAddress);
        } else {
            check('deviceAddress.set : adresse courante illisible, écriture non tentée', false);
        }
        const parity = uart.find((f) => f.name === 'parity')?.value;
        const baudRate = uart.find((f) => f.name === 'baudRate')?.value;
        if (typeof parity === 'number' && typeof baudRate === 'number') {
            const setting = `${ao8.enums.baudRate.find((e) => e.value === baudRate)?.label ?? baudRate} ${ao8.enums.parity.find((e) => e.value === parity)?.label ?? parity}`;
            await run({ blockId: 'uart', operationId: 'set', value: { parity, baudRate } });
            const version = await run({ blockId: 'version', operationId: 'read' });
            check(`uart.set ${setting} : communication ${version.isOk ? 'maintenue' : 'perdue'}`, version.isOk);
        } else {
            check('uart.set : paramètres UART courants illisibles, écriture non tentée', false);
        }

        // Restauration des consignes initiales (hors plage : non réécrites, sorties laissées au min)
        if (initialOutputs?.every((v) => v >= minMv && v <= maxMv)) {
            await run({ blockId: 'outputs', operationId: 'setAll', value: initialOutputs });
            await expectOutputs('outputs restauration', initialOutputs);
        }

        const failed = checks.filter((c) => c.startsWith('ECHEC'));
        console.log(`\n=== AO 8CH : ${checks.length} vérifications, ${checks.length - failed.length} OK, ${failed.length} en échec`);
        checks.forEach((c) => console.log(`  ${c}`));
        console.log(`\n=== AO 8CH : ${errors.length} opérations en erreur`);
        errors.forEach((e) => console.log(`  ERREUR ${e}`));
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
            outcome.value = this.decodeResult(template, operation, raw, scope, this._range(operation, command.range)?.min);
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

    // Écriture persistante demandée : décalage déclaré par l'opération (lève si l'opération ne le prévoit pas)
    private _persistenceOffset(block: RegisterBlock, operation: RegisterOperation, command: RegisterOperationCommand): number {
        if (!command.isPersistent) {
            return 0;
        }
        const offset = operation.params?.persistence?.address;
        if (offset === undefined) {
            throw new RegisterMapInputError(`${block.id}.${operation.id} : écriture persistante non prévue par le template`);
        }
        return offset;
    }

    // Sous-plage de voies d'une opération de scope 'range' (voies 0..params.length-1) ; undefined : toutes, ou autre scope
    private _range(operation: RegisterOperation, range: OperationRange | undefined): OperationRange | undefined {
        if (operation.scope !== 'range' || !range) {
            return undefined;
        }
        const count = operation.params?.length ?? 1;
        const { min, max } = range;
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || min > max || max >= count) {
            throw new RegisterMapInputError(`${operation.id} : range doit vérifier 0 <= min <= max <= ${count - 1}`);
        }
        return range;
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
    private _decodeChannels(template: RegisterMapTemplate, result: ChannelResult, data: (number | boolean)[], first = 0): DecodedValue {
        const labelStart = template.hardware.channels?.labelStart ?? 1;
        const channels = data.map((v, i): DecodedChannel => {
            const index = first + i;
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
