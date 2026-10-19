import { DecodedField, RegisterField, RegisterFieldType, RegisterMapTemplate } from '../models/register-map.model';

export type FormulaEvaluator = (formula: string, scope: Record<string, number>) => number;
type WordOrder = RegisterMapTemplate['hardware']['wordOrder'];

const DEFAULT_WORDS: Record<RegisterFieldType, number> = {
    int16: 1, uint16: 1, bits: 1, int32: 2, uint32: 2, float: 2, bcd: 1, bcdDateTime: 3, ascii: 1, hex: 1
};
const TEXT_TYPES: RegisterFieldType[] = ['bcd', 'bcdDateTime', 'ascii', 'hex'];

const Hex = (n: number, digits: number): string => n.toString(16).toUpperCase().padStart(digits, '0');

/** Décodage des champs typés d'une lecture de registres (result.type = 'fields') */
export class RegisterFieldDecoder {

    public static wordCount(field: RegisterField): number {
        return field.words ?? DEFAULT_WORDS[field.type];
    }

    public static isNumeric(field: RegisterField): boolean {
        return !TEXT_TYPES.includes(field.type);
    }

    /**
     * Décode tous les champs de `words`. Les formules reçoivent `raw` (valeur brute du champ),
     * les valeurs brutes des autres champs numériques (par nom) et `externalScope` (scopeFrom).
     */
    public static decodeAll(
        template: RegisterMapTemplate,
        fields: RegisterField[],
        words: number[],
        evaluate: FormulaEvaluator,
        externalScope: Record<string, number> = {}
    ): DecodedField[] {
        const wordOrder = template.hardware.wordOrder;
        const raws = fields.map((f) => RegisterFieldDecoder.raw(f, words.slice(f.offset, f.offset + RegisterFieldDecoder.wordCount(f)), wordOrder));
        const scope = { ...externalScope };
        fields.forEach((f, i) => {
            if (typeof raws[i] === 'number') scope[f.name] = raws[i] as number;
        });
        return fields.map((f, i) => RegisterFieldDecoder._finalize(template, f, raws[i], scope, evaluate));
    }

    // eslint-disable-next-line complexity
    public static raw(field: RegisterField, words: number[], wordOrder: WordOrder): number | string {
        switch (field.type) {
            case 'int16':
                return words[0] > 0x7fff ? words[0] - 0x10000 : words[0];
            case 'uint16':
                return words[0];
            case 'bits':
                return words.length > 1 ? RegisterFieldDecoder._toBuffer(words, wordOrder).readUInt32BE(0) : words[0];
            case 'int32':
                return RegisterFieldDecoder._toBuffer(words, wordOrder).readInt32BE(0);
            case 'uint32':
                return RegisterFieldDecoder._toBuffer(words, wordOrder).readUInt32BE(0);
            case 'float':
                return Number(RegisterFieldDecoder._toBuffer(words, wordOrder).readFloatBE(0).toPrecision(7));
            case 'bcd':
                return words.map((w) => Hex(w, 4)).join('');
            case 'hex':
                return words.map((w) => Hex(w, 4)).join(' ');
            case 'ascii':
                return String.fromCharCode(...words.flatMap((w) => [w >> 8, w & 0xff]).filter((c) => c > 0)).trim();
            case 'bcdDateTime':
                // octet de poids faible en premier : S, Mi, H, D, Mo, Y
                return words.flatMap((w) => [w & 0xff, w >> 8]).map((b) => Hex(b, 2)).join('');
        }
    }

    // Deux mots → buffer big-endian (mot de poids fort en tête)
    private static _toBuffer(words: number[], wordOrder: WordOrder): Buffer {
        const [low, high] = wordOrder === 'lowFirst' ? [words[0], words[1]] : [words[1], words[0]];
        const buffer = Buffer.alloc(4);
        buffer.writeUInt16BE(high, 0);
        buffer.writeUInt16BE(low, 2);
        return buffer;
    }

    private static _finalize(
        template: RegisterMapTemplate,
        field: RegisterField,
        raw: number | string,
        scope: Record<string, number>,
        evaluate: FormulaEvaluator
    ): DecodedField {
        const decoded: DecodedField = { name: field.name, label: field.label, raw, value: raw };
        if (field.unit) decoded.unit = field.unit;
        if (typeof raw === 'string') {
            if (field.type === 'bcdDateTime') decoded.text = RegisterFieldDecoder._formatDateTime(raw);
            return decoded;
        }
        if (field.formula) decoded.value = evaluate(field.formula, { ...scope, raw });
        RegisterFieldDecoder._label(template, field, raw, decoded);
        if (field.expected !== undefined) decoded.isExpected = Math.abs(Number(decoded.value) - field.expected) < 0.01;
        return decoded;
    }

    // Bits actifs (type bits) ou libellé de la valeur (enum)
    private static _label(template: RegisterMapTemplate, field: RegisterField, raw: number, decoded: DecodedField): void {
        const entries = field.enum ? template.enums[field.enum] ?? [] : [];
        if (field.type === 'bits') {
            const offset = field.bitOffset ?? 0;
            decoded.flags = entries.filter((e) => e.value >= offset && Math.floor(raw / 2 ** (e.value - offset)) % 2 === 1).map((e) => e.label);
        } else if (entries.length) {
            decoded.text = entries.find((e) => e.value === raw)?.label;
        }
    }

    private static _formatDateTime(raw: string): string {
        const [s, mi, h, d, mo, y] = raw.match(/../g) ?? [];
        return `20${y}-${mo}-${d} ${h}:${mi}:${s}`;
    }
}
