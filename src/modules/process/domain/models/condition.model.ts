import { ElementType } from './event.model';

export enum ConditionSymbolStart {
    NONE = '',
    OPEN_PAREN = '('
}

export enum ConditionSymbolEnd {
    NONE = '',
    CLOSE_PAREN = ')'
}

export enum ConditionConnector {
    AND = 'and',
    OR = 'or'
}

export enum ConditionOperator {
    EQ = '=',
    NEQ = '!=',
    GT = '>',
    GTE = '>=',
    LT = '<',
    LTE = '<='
}

export enum ConditionParentType {
    TRIGGER = 'TRIGGER',
    CYCLE = 'CYCLE',
    SEQUENCE = 'SEQUENCE'
}

// Expression reconstruite (tri par order) : connector (sauf 1re) + symbolStart + condition + symbolEnd
export class ConditionModel {
    public elementId: string;
    public elementType: ElementType;
    public operator: ConditionOperator;
    // 'ON' | 'OFF' pour CYCLE/SEQUENCE, valeur numerique (string ou number) pour SENSOR
    public value: string | number;
    public order: number;
    public connector?: ConditionConnector;
    public symbolStart?: ConditionSymbolStart;
    public symbolEnd?: ConditionSymbolEnd;
    public parentId?: string;
    public parentType?: ConditionParentType;
}
