import { RegisterMapInputError } from '../errors/register-map.error';
import {
    CompositeField, OperationChannelParam, OperationInput, OperationResult, OperationResultParam, OperationValueParam, READ_FUNCTIONS,
    RegisterBlock, RegisterEnumEntry, RegisterFunction, RegisterMapTemplate, RegisterOperation, RegisterOperationParams, RegisterOperationValue,
    RegisterRequest
} from '../models/register-map.model';
import { RegisterFieldDecoder } from './register-field.util';

type InputValue = RegisterOperationValue | undefined;

/** Cohérence interne d'une register map (fonctions connues, enums référencés présents, longueurs dans la plage) */
export class RegisterMapValidator {

    /** Liste des incohérences ; vide = template valide. `allowedKinds` : contrôle optionnel du kind */
    public static validate(template: RegisterMapTemplate, allowedKinds?: string[]): string[] {
        const errors: string[] = [];
        if (!template.kind || (allowedKinds && !allowedKinds.includes(template.kind))) {
            errors.push(`kind inconnu: ${template.kind}`);
        }
        RegisterMapValidator._checkEnum(template, errors, 'hardware.exceptionCodes', template.hardware?.exceptionCodes);
        const blockIds = new Set<string>();
        for (const block of template.registerMap ?? []) {
            if (blockIds.has(block.id)) errors.push(`bloc "${block.id}" dupliqué`);
            blockIds.add(block.id);
            RegisterMapValidator._validateBlock(template, block, errors);
        }
        return errors;
    }

    private static _validateBlock(template: RegisterMapTemplate, block: RegisterBlock, errors: string[]): void {
        const functions = Object.values(RegisterFunction) as string[];
        const opIds = new Set<string>();
        // Avec stride, une lecture couvre un bloc (stride mots) ; sans, toute la plage
        const maxLength = block.address.stride ?? block.address.count;
        for (const op of block.operations) {
            const where = `${block.id}.${op.id}`;
            if (opIds.has(op.id)) errors.push(`${where}: opération dupliquée`);
            opIds.add(op.id);
            if (!functions.includes(op.function)) errors.push(`${where}: fonction "${op.function}" inconnue`);
            if ((op.params?.length ?? 1) > maxLength) errors.push(`${where}: length > ${block.address.stride ? 'stride' : 'address.count'}`);
            RegisterMapValidator._enumRefs(op).forEach((name) => RegisterMapValidator._checkEnum(template, errors, where, name));
            RegisterMapValidator._validateComposite(op, where, errors);
            RegisterMapValidator._validateFields(op, where, errors);
            RegisterMapValidator._validateScopeFrom(template, op, where, errors);
            RegisterMapValidator._validatePersistence(op, where, errors);
        }
    }

    private static _enumRefs(op: RegisterOperation): string[] {
        const input = op.input;
        const refs: string[] = [];
        if (input?.type === 'enum' || input?.type === 'enum[]') refs.push(input.enum);
        if (input?.type === 'composite') refs.push(...input.fields.map((f) => f.enum).filter(Boolean));
        if (op.result?.type === 'enum[]') refs.push(op.result.enum);
        if (op.result?.type === 'fields') refs.push(...op.result.fields.map((f) => f.enum).filter(Boolean));
        return refs;
    }

    private static _validateComposite(op: RegisterOperation, where: string, errors: string[]): void {
        if (op.input?.type !== 'composite') return;
        op.input.fields
            .filter((f) => !f.enum && (f.min === undefined || f.max === undefined))
            .forEach((f) => errors.push(`${where}.${f.name}: enum ou min/max requis`));
    }

    private static _validateFields(op: RegisterOperation, where: string, errors: string[]): void {
        if (op.result?.type !== 'fields') return;
        const length = op.params?.length ?? 1;
        const names = new Set<string>();
        for (const field of op.result.fields) {
            if (names.has(field.name)) errors.push(`${where}.${field.name}: champ dupliqué`);
            names.add(field.name);
            if (field.offset + RegisterFieldDecoder.wordCount(field) > length) errors.push(`${where}.${field.name}: dépasse params.length`);
            if (field.formula && !RegisterFieldDecoder.isNumeric(field)) errors.push(`${where}.${field.name}: formule sur un champ texte`);
        }
    }

    private static _validatePersistence(op: RegisterOperation, where: string, errors: string[]): void {
        const persistence = op.params?.persistence;
        if (!persistence) return;
        if (READ_FUNCTIONS.includes(op.function)) errors.push(`${where}: persistence sur une lecture`);
        if (!Number.isInteger(persistence.address) || persistence.address <= 0) errors.push(`${where}: persistence.address doit être un entier > 0`);
    }

    private static _validateScopeFrom(template: RegisterMapTemplate, op: RegisterOperation, where: string, errors: string[]): void {
        for (const ref of op.scopeFrom ?? []) {
            const [blockId, operationId] = ref.split('.');
            const source = template.registerMap.find((b) => b.id === blockId)?.operations.find((o) => o.id === operationId);
            if (source?.result?.type !== 'fields') errors.push(`${where}: scopeFrom "${ref}" doit viser une lecture à champs`);
        }
    }

    private static _checkEnum(template: RegisterMapTemplate, errors: string[], where: string, name?: string): void {
        if (name !== undefined && !template.enums?.[name]) errors.push(`${where}: enum "${name}" absent`);
    }
}

/** Description des paramètres à fournir pour une opération (voie ou voies couvertes, valeur), enums résolus */
export class RegisterOperationDescriber {

    public static describe(template: RegisterMapTemplate, block: RegisterBlock, operation: RegisterOperation): RegisterOperationParams {
        const input = operation.input;
        // clés absentes (pas undefined) : sinon persistées à null en base
        return {
            ...(operation.scope === 'channel' && { channel: RegisterOperationDescriber._channels(template, block.address.count) }),
            ...(operation.scope === 'range' && { range: RegisterOperationDescriber._channels(template, operation.params?.length ?? 1) }),
            ...(input && input.type !== 'none' && { value: RegisterOperationDescriber._value(template, input) }),
            ...(operation.result && operation.result.type !== 'echo'
                && { result: RegisterOperationDescriber._result(operation.result) }),
            isConfirmRequired: !!block.danger,
            isPersistable: !!operation.params?.persistence
        };
    }

    // Voies 0..count-1, numérotées à partir de hardware.channels.labelStart
    private static _channels(template: RegisterMapTemplate, count: number): OperationChannelParam {
        return { min: 0, max: count - 1, labelStart: template.hardware.channels?.labelStart ?? 1 };
    }

    // Champs : nom, libellé, type et unité / description / autoCreate (si présents) ; autres résultats : type seul
    private static _result(result: Exclude<OperationResult, { type: 'echo' }>): OperationResultParam {
        if (result.type !== 'fields') {
            return { type: result.type };
        }
        return {
            type: 'fields',
            fields: result.fields.map(({ name, label, type, unit, description, autoCreate }) =>
                ({ name, label, type, ...(unit && { unit }), ...(description && { description }), ...(autoCreate && { autoCreate }) }))
        };
    }

    private static _value(template: RegisterMapTemplate, input: Exclude<OperationInput, { type: 'none' }>): OperationValueParam {
        switch (input.type) {
            case 'enum':
                return { type: 'enum', entries: RegisterValueEncoder.entries(template, input.enum, input.only) };
            case 'enum[]':
                return { type: 'enum[]', length: input.length, entries: RegisterValueEncoder.entries(template, input.enum) };
            case 'composite':
                return {
                    type: 'composite',
                    encode: input.encode,
                    fields: input.fields.map(({ enum: enumName, ...field }) =>
                        (enumName ? { ...field, entries: RegisterValueEncoder.entries(template, enumName) } : field))
                };
            default:
                return { ...input };
        }
    }
}

/** Traduit la saisie du front en valeur Modbus selon operation.input ; lève RegisterMapInputError si invalide */
export class RegisterValueEncoder {

    /** `length` : nombre de voies saisies (sous-plage d'une opération de scope 'range'), sinon input.length */
    public static encode(template: RegisterMapTemplate, operation: RegisterOperation, value: InputValue, length?: number): RegisterRequest['value'] {
        const input = operation.input ?? { type: 'none' };
        const where = `${operation.id} (${input.type})`;
        switch (input.type) {
            case 'none':
                if (input.fixedValue === undefined) throw new RegisterMapInputError(`${where} : fixedValue absent du template`);
                return input.fixedValue;
            case 'enum':
                return RegisterValueEncoder.checkEnumValue(RegisterValueEncoder.entries(template, input.enum, input.only), value, where);
            case 'number':
                return RegisterValueEncoder._checkRange(value ?? input.default, input.min, input.max, where);
            case 'boolean[]':
                return RegisterValueEncoder._checkArray(value, length ?? input.length, where).map(Boolean);
            case 'enum[]': {
                const entries = RegisterValueEncoder.entries(template, input.enum);
                return RegisterValueEncoder._checkArray(value, length ?? input.length, where)
                    .map((v) => RegisterValueEncoder.checkEnumValue(entries, v, where));
            }
            case 'number[]':
                return RegisterValueEncoder._checkArray(value, length ?? input.length, where)
                    .map((v) => RegisterValueEncoder._checkRange(v, input.min, input.max, where));
            case 'composite':
                return RegisterValueEncoder._encodeComposite(template, input.fields, value, where);
        }
    }

    public static entries(template: RegisterMapTemplate, enumName: string, only?: string[]): RegisterEnumEntry[] {
        const entries = template.enums[enumName] ?? [];
        return only ? entries.filter((e) => only.includes(e.label)) : entries;
    }

    public static checkEnumValue(entries: RegisterEnumEntry[], value: unknown, where: string): number {
        const entry = entries.find((e) => e.value === (typeof value === 'boolean' ? Number(value) : value));
        if (!entry) {
            throw new RegisterMapInputError(`${where} : valeur ${value} hors [${entries.map((e) => `${e.value}=${e.label}`).join(', ')}]`);
        }
        return entry.value;
    }

    private static _checkRange(value: unknown, min: number, max: number, where: string): number {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
            throw new RegisterMapInputError(`${where} : entier attendu entre ${min} et ${max}`);
        }
        return value;
    }

    private static _checkArray(value: InputValue, length: number, where: string): (number | boolean)[] {
        if (!Array.isArray(value) || value.length !== length) {
            throw new RegisterMapInputError(`${where} : tableau de ${length} valeurs attendu (booléens ou 0/1 pour des sorties)`);
        }
        return value;
    }

    // Un octet par champ (cf. CompositeField.byte/word), champ absent = valeur par défaut du template ;
    // plusieurs mots → tableau (writeRegisters)
    private static _encodeComposite(template: RegisterMapTemplate, fields: CompositeField[], value: InputValue, where: string): number | number[] {
        const values = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, number>;
        const words: number[] = [];
        for (const field of fields) {
            const word = field.word ?? 0;
            const byte = RegisterValueEncoder._encodeByte(template, field, values[field.name] ?? field.default, `${where}.${field.name}`);
            words[word] = (words[word] ?? 0) | (byte << (field.byte === 'high' ? 8 : 0));
        }
        const filled = Array.from(words, (w) => w ?? 0);
        return filled.length > 1 ? filled : filled[0];
    }

    private static _encodeByte(template: RegisterMapTemplate, field: CompositeField, input: unknown, where: string): number {
        const isBcd = field.encoding === 'bcd';
        const v = field.enum
            ? RegisterValueEncoder.checkEnumValue(RegisterValueEncoder.entries(template, field.enum), input, where)
            : RegisterValueEncoder._checkRange(input, field.min, isBcd ? Math.min(field.max, 99) : field.max, where);
        return isBcd ? Math.floor(v / 10) * 16 + (v % 10) : v & 0xff;
    }
}
