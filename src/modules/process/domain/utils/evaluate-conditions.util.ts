import * as math from 'mathjs';
import { ExecutableAction, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import {
    ConditionConnector, ConditionModel, ConditionOperator, ConditionSymbolEnd, ConditionSymbolStart
} from '@process/domain/models/condition.model';
import { ElementType } from '@process/domain/models/event.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';

export type DeviceValueResolver = (elementId: string) => Promise<SensorValueModel | ProcessValueModel | undefined>;

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

export function buildConditionExpression(ordered: ConditionLike[], results: boolean[]): string {
    return ordered
        .map((condition, i) => [
            i > 0 ? condition.connector : '',
            condition.symbolStart ?? '',
            String(results[i]),
            condition.symbolEnd ?? ''
        ].filter(Boolean).join(' '))
        .join(' ');
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
export type ConditionFailureReporter = (detail: { reason: string; results?: boolean[]; expression?: string }) => void;

export async function evaluateConditions(conditions: ConditionModel[] | undefined, getDeviceValue: DeviceValueResolver,
    onFailure?: ConditionFailureReporter): Promise<boolean> {
    if (!conditions?.length) {
        return true;
    }
    const structureError = validateConditionStructure(conditions);
    if (structureError) {
        onFailure?.({ reason: structureError });
        return false;
    }

    const ordered = sortConditions(conditions);
    const results: boolean[] = [];
    for (const condition of ordered) {
        results.push(await evaluateCondition(condition, getDeviceValue));
    }

    const expression = buildConditionExpression(ordered, results);
    try {
        const isVerified = Boolean(math.evaluate(expression));
        if (!isVerified) { onFailure?.({ reason: 'conditions not verified', results, expression }); }
        return isVerified;
    } catch (e) {
        onFailure?.({ reason: `expression evaluation failed: ${(e as Error)?.message}`, results, expression });
        return false;
    }
}
