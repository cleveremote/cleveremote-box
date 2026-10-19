import { Injectable } from '@nestjs/common';
import { create, all, MathNode, EvalFunction } from 'mathjs';
import { RegisterMapInputError } from '../errors/register-map.error';

interface CompiledFormula {
    code: EvalFunction;
    variables: string[];
}

/** Formules des templates (champs, params.formula) : instance mathjs restreinte, sans risque d'injection */
@Injectable()
export class FormulaEngine {
    private readonly _math = create(all);
    private readonly _cache = new Map<string, CompiledFormula>();
    // Référence conservée avant désactivation de math.parse : sans elle, plus aucune formule ne serait parsable
    private readonly _parse = this._math.parse.bind(this._math);

    public constructor() {
        this._math.import(
            {
                import: () => { throw new Error('désactivé'); },
                createUnit: () => { throw new Error('désactivé'); },
                evaluate: () => { throw new Error('désactivé'); },
                parse: () => { throw new Error('désactivé'); }
            },
            { override: true }
        );
    }

    public evaluate(formula: string, scope: Record<string, number>): number {
        return this._compile(formula).code.evaluate(scope);
    }

    /** Variables libres de la formule (hors fonctions/constantes mathjs) */
    public variables(formula: string): string[] {
        return this._compile(formula).variables;
    }

    private _compile(formula: string): CompiledFormula {
        let compiled = this._cache.get(formula);
        if (!compiled) {
            let node: MathNode;
            try {
                node = this._parse(formula);
            } catch (e) {
                throw new RegisterMapInputError(`Formule invalide "${formula}" : ${(e as Error).message}`);
            }
            // MathNode.filter() ne typifie pas ses sous-classes (SymbolNode.name/isSymbolNode)
            /* eslint-disable @typescript-eslint/no-explicit-any */
            compiled = {
                code: node.compile(),
                variables: node
                    .filter((x: any) => x.isSymbolNode && !(this._math as any)[x.name])
                    .map((x: any) => x.name as string)
            };
            /* eslint-enable @typescript-eslint/no-explicit-any */
            this._cache.set(formula, compiled);
        }
        return compiled;
    }
}
