import { ExecutableAction, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import {
    ConditionConnector, ConditionModel, ConditionOperator, ConditionSymbolEnd, ConditionSymbolStart
} from '@process/domain/models/condition.model';
import { ElementType } from '@process/domain/models/event.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';

export type DeviceValueResolver = (elementId: string) => Promise<SensorValueModel | ProcessValueModel | undefined>;
// false si l'element cible de la condition n'existe plus (capteur/cycle/sequence supprime, elementId vide) :
// la condition est alors ignoree (ni vraie ni fausse), cf. evaluateConditions
export type ConditionElementResolver = (condition: ConditionModel) => boolean;
// resultat par condition (ordre trie) : null = condition ignoree (element inexistant)
export type ConditionResult = boolean | null;

type ConditionLike = Pick<ConditionModel, 'order' | 'connector' | 'symbolStart' | 'symbolEnd'>;

export function sortConditions<T extends { order?: number }>(conditions: T[]): T[] {
    return conditions
        .map((condition, index) => ({ condition, index }))
        .sort((a, b) => (a.condition.order ?? a.index) - (b.condition.order ?? b.index))
        .map((entry) => entry.condition);
}

// Retourne un message d'erreur si la structure (ordre, parentheses, connecteurs) est invalide, sinon null.
export function validateConditionStructure(conditions: ConditionLike[] | undefined): string | null {
    if (!conditions?.length) { return null; }
    const orders = conditions.map((c) => c.order).filter((order) => order !== undefined && order !== null);
    if (new Set(orders).size !== orders.length) { return 'condition orders must be unique'; }

    let depth = 0;
    const ordered = sortConditions(conditions);
    for (let i = 0; i < ordered.length; i++) {
        const { connector, symbolStart, symbolEnd } = ordered[i];
        if (i > 0 && connector !== ConditionConnector.AND && connector !== ConditionConnector.OR) {
            return `condition #${i + 1} must have a connector (and/or)`;
        }
        const opens = symbolStart === ConditionSymbolStart.OPEN_PAREN ? 1 : 0;
        const closes = symbolEnd === ConditionSymbolEnd.CLOSE_PAREN ? 1 : 0;
        depth += opens;
        // "( x )" autour d'une seule condition est autorise, seul un ')' sans '(' prealable est invalide
        depth -= closes;
        if (depth < 0) { return `unbalanced parenthesis at condition #${i + 1}`; }
    }
    return depth === 0 ? null : 'unbalanced parenthesis: missing ")"';
}

export function buildConditionExpression(ordered: ConditionLike[], results: ConditionResult[]): string {
    return ordered
        .map((condition, i) => [
            i > 0 ? condition.connector : '',
            condition.symbolStart ?? '',
            results[i] === null ? 'ignored' : String(results[i]),
            condition.symbolEnd ?? ''
        ].filter(Boolean).join(' '))
        .join(' ');
}

type Token = { kind: 'open' | 'close' | 'and' | 'or' } | { kind: 'value'; value: ConditionResult };

function toTokens(ordered: ConditionLike[], results: ConditionResult[]): Token[] {
    const tokens: Token[] = [];
    ordered.forEach((condition, i) => {
        if (i > 0) { tokens.push({ kind: condition.connector === ConditionConnector.OR ? 'or' : 'and' }); }
        if (condition.symbolStart === ConditionSymbolStart.OPEN_PAREN) { tokens.push({ kind: 'open' }); }
        tokens.push({ kind: 'value', value: results[i] });
        if (condition.symbolEnd === ConditionSymbolEnd.CLOSE_PAREN) { tokens.push({ kind: 'close' }); }
    });
    return tokens;
}

// null (condition ignoree) est neutre : "x and ignored" = x, "x or ignored" = x ; un groupe entierement ignore vaut null
function combine(left: ConditionResult, right: ConditionResult, op: 'and' | 'or'): ConditionResult {
    if (left === null) { return right; }
    if (right === null) { return left; }
    return op === 'and' ? left && right : left || right;
}

// descente recursive (structure deja validee) : 'and' prioritaire sur 'or', comme mathjs
export function evaluateConditionExpression(ordered: ConditionLike[], results: ConditionResult[]): ConditionResult {
    const tokens = toTokens(ordered, results);
    let pos = 0;
    const parseOr = (): ConditionResult => {
        let value = parseAnd();
        while (tokens[pos]?.kind === 'or') { pos++; value = combine(value, parseAnd(), 'or'); }
        return value;
    };
    const parseAnd = (): ConditionResult => {
        let value = parsePrimary();
        while (tokens[pos]?.kind === 'and') { pos++; value = combine(value, parsePrimary(), 'and'); }
        return value;
    };
    const parsePrimary = (): ConditionResult => {
        const token = tokens[pos++];
        if (token?.kind === 'open') {
            const value = parseOr();
            if (tokens[pos++]?.kind !== 'close') { throw new Error('missing ")"'); }
            return value;
        }
        if (token?.kind === 'value') { return token.value; }
        throw new Error(`unexpected token at position ${pos - 1}`);
    };
    const value = parseOr();
    if (pos !== tokens.length) { throw new Error(`unexpected token at position ${pos}`); }
    return value;
}

function compare(left: number | string, operator: ConditionOperator, right: number | string): boolean {
    switch (operator) {
        case ConditionOperator.EQ: return left === right;
        case ConditionOperator.NEQ: return left !== right;
        case ConditionOperator.GT: return left > right;
        case ConditionOperator.GTE: return left >= right;
        case ConditionOperator.LT: return left < right;
        case ConditionOperator.LTE: return left <= right;
        default: return false;
    }
}

async function evaluateCondition(condition: ConditionModel, getDeviceValue: DeviceValueResolver): Promise<boolean> {
    const extractedVal = await getDeviceValue(condition.elementId);
    if (!extractedVal) { return false; }

    if (condition.elementType === ElementType.SENSOR) {
        const raw = (extractedVal as SensorValueModel).value;
        if (raw === undefined || raw === null) { return false; }
        const current = Number(raw);
        const expected = Number(condition.value);
        if (Number.isNaN(current) || Number.isNaN(expected)) { return false; }
        return compare(current, condition.operator, expected);
    }

    const status = (extractedVal as ProcessValueModel).status;
    if (status === undefined || status === null) { return false; }
    if (condition.operator !== ConditionOperator.EQ && condition.operator !== ConditionOperator.NEQ) { return false; }
    const current = status === ExecutableStatus.STOPPED ? ExecutableAction.OFF : ExecutableAction.ON;
    return compare(current, condition.operator, String(condition.value).toUpperCase());
}

// appele quand l'evaluation retourne false, pour tracer la cause (structure invalide, resultats, expression)
export type ConditionFailureReporter = (detail: { reason: string; results?: ConditionResult[]; expression?: string }) => void;

// conditions dont l'element n'existe plus (isElementPresent false) : ignorees, non evaluees ; si toutes le sont,
// les conditions sont considerees verifiees (comme une liste vide)
export async function evaluateConditions(conditions: ConditionModel[] | undefined, getDeviceValue: DeviceValueResolver,
    onFailure?: ConditionFailureReporter, isElementPresent?: ConditionElementResolver): Promise<boolean> {
    if (!conditions?.length) {
        return true;
    }
    const structureError = validateConditionStructure(conditions);
    if (structureError) {
        onFailure?.({ reason: structureError });
        return false;
    }

    const ordered = sortConditions(conditions);
    const results: ConditionResult[] = [];
    for (const condition of ordered) {
        const isPresent = !!condition.elementId && (isElementPresent?.(condition) ?? true);
        results.push(isPresent ? await evaluateCondition(condition, getDeviceValue) : null);
    }

    const expression = buildConditionExpression(ordered, results);
    try {
        const isVerified = evaluateConditionExpression(ordered, results) ?? true;
        if (!isVerified) { onFailure?.({ reason: 'conditions not verified', results, expression }); }
        return isVerified;
    } catch (e) {
        onFailure?.({ reason: `expression evaluation failed: ${(e as Error)?.message}`, results, expression });
        return false;
    }
}

// element cible d'une condition present dans la structure chargee (capteur non supprime, cycle, sequence)
export function isConditionElementPresent(condition: ConditionModel,
    structure: { sensors?: { _id: string; deletedAt?: Date | null }[]; cycles?: { _id: string }[] } | undefined,
    sequences: { _id: string }[] | undefined): boolean {
    switch (condition.elementType) {
        case ElementType.SENSOR: return !!structure?.sensors?.some((x) => x._id === condition.elementId && !x.deletedAt);
        case ElementType.CYCLE: return !!structure?.cycles?.some((x) => x._id === condition.elementId);
        case ElementType.SEQUENCE: return !!sequences?.some((x) => x._id === condition.elementId);
        default: return false;
    }
}
