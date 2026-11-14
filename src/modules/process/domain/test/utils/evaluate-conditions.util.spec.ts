import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import {
    ConditionConnector, ConditionModel, ConditionOperator, ConditionSymbolEnd, ConditionSymbolStart
} from '@process/domain/models/condition.model';
import { ElementType } from '@process/domain/models/event.model';
import { evaluateConditions, validateConditionStructure } from '@process/domain/utils/evaluate-conditions.util';

function C(overrides: Partial<ConditionModel>): ConditionModel {
    return Object.assign(new ConditionModel(), overrides);
}

// temp > 25 and (pompe = ON or vanne = OFF), format envoye par le builder front
function FrontConditions(): ConditionModel[] {
    return [
        C({ elementType: ElementType.SENSOR, elementId: 'temp', operator: ConditionOperator.GT, value: '25',
            connector: ConditionConnector.AND, symbolStart: ConditionSymbolStart.NONE, symbolEnd: ConditionSymbolEnd.NONE, order: 1 }),
        C({ elementType: ElementType.CYCLE, elementId: 'pompe', operator: ConditionOperator.EQ, value: 'ON',
            connector: ConditionConnector.AND, symbolStart: ConditionSymbolStart.OPEN_PAREN, symbolEnd: ConditionSymbolEnd.NONE, order: 2 }),
        C({ elementType: ElementType.CYCLE, elementId: 'vanne', operator: ConditionOperator.EQ, value: 'OFF',
            connector: ConditionConnector.OR, symbolStart: ConditionSymbolStart.NONE, symbolEnd: ConditionSymbolEnd.CLOSE_PAREN, order: 3 })
    ];
}

function Resolver(temp: number, pompe: ExecutableStatus, vanne: ExecutableStatus) {
    const values: Record<string, unknown> = { temp: { value: temp }, pompe: { status: pompe }, vanne: { status: vanne } };
    return (id: string) => Promise.resolve(values[id] as never);
}

describe('evaluateConditions', () => {
    it('should return true when there is no condition', async () => {
        expect(await evaluateConditions([], Resolver(0, ExecutableStatus.STOPPED, ExecutableStatus.STOPPED))).toBe(true);
    });

    it.each([
        [30, ExecutableStatus.IN_PROCCESS, ExecutableStatus.IN_PROCCESS, true],
        [30, ExecutableStatus.STOPPED, ExecutableStatus.STOPPED, true],
        [30, ExecutableStatus.STOPPED, ExecutableStatus.IN_PROCCESS, false],
        [20, ExecutableStatus.IN_PROCCESS, ExecutableStatus.STOPPED, false]
    ])('temp=%s pompe=%s vanne=%s -> %s', async (temp, pompe, vanne, expected) => {
        expect(await evaluateConditions(FrontConditions(), Resolver(temp, pompe, vanne))).toBe(expected);
    });

    it('should respect the order field rather than the array order', async () => {
        const reversed = FrontConditions().reverse();
        expect(await evaluateConditions(reversed, Resolver(30, ExecutableStatus.STOPPED, ExecutableStatus.STOPPED))).toBe(true);
    });

    it('should return false when parentheses are unbalanced', async () => {
        const conditions = FrontConditions();
        conditions[2].symbolEnd = ConditionSymbolEnd.NONE;
        expect(await evaluateConditions(conditions, Resolver(30, ExecutableStatus.IN_PROCCESS, ExecutableStatus.STOPPED))).toBe(false);
    });

    it('should return false for an ordering comparison on a cycle status', async () => {
        const conditions = [C({ elementType: ElementType.CYCLE, elementId: 'pompe', operator: ConditionOperator.GT, value: 'ON', order: 1 })];
        expect(await evaluateConditions(conditions, Resolver(0, ExecutableStatus.IN_PROCCESS, ExecutableStatus.STOPPED))).toBe(false);
    });
});

describe('validateConditionStructure', () => {
    it('should accept the front builder example', () => {
        expect(validateConditionStructure(FrontConditions())).toBeNull();
    });

    it('should reject a missing connector after the first condition', () => {
        const conditions = FrontConditions();
        conditions[1].connector = undefined;
        expect(validateConditionStructure(conditions)).toContain('connector');
    });

    it('should reject a closing parenthesis before any opening one', () => {
        const conditions = FrontConditions();
        conditions[1].symbolStart = ConditionSymbolStart.NONE;
        expect(validateConditionStructure(conditions)).toContain('unbalanced');
    });

    it('should reject duplicated orders', () => {
        const conditions = FrontConditions();
        conditions[2].order = 2;
        expect(validateConditionStructure(conditions)).toContain('unique');
    });
});
