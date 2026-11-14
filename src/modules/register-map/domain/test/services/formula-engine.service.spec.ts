import { RegisterMapInputError } from '@register-map/domain/errors/register-map.error';
import { FormulaEngine } from '@register-map/domain/services/formula-engine.service';

describe('FormulaEngine', () => {
    let engine: FormulaEngine;

    beforeEach(() => {
        engine = new FormulaEngine();
    });

    it('should evaluate a formula against the given scope', () => {
        expect(engine.evaluate('raw * 2 + offset', { raw: 10, offset: 1 })).toEqual(21);
    });

    it('should reuse the compiled formula on repeated calls with the same expression', () => {
        expect(engine.evaluate('raw + 1', { raw: 1 })).toEqual(2);
        expect(engine.evaluate('raw + 1', { raw: 5 })).toEqual(6);
    });

    it('should list the free variables of a formula', () => {
        expect(engine.variables('N + Nf * 10 ^ -n + sqrt(raw)')).toEqual(['N', 'Nf', 'n', 'raw']);
    });

    it('should throw a RegisterMapInputError for a syntactically invalid formula', () => {
        expect(() => engine.evaluate('raw +', {})).toThrow(RegisterMapInputError);
        expect(() => engine.evaluate('raw +', {})).toThrow(/Formule invalide/);
    });

    it.each([
        ['import("x")'],
        ['createUnit("foo")'],
        ['evaluate("1+1")'],
        ['parse("1+1")']
    ])('should throw when a formula tries to reach the disabled mathjs function %s', (expr) => {
        expect(() => engine.evaluate(expr, {})).toThrow('désactivé');
    });
});
