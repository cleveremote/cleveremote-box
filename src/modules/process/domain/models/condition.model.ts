import { ExecutableAction } from "../interfaces/executable.interface";
import { ElementType } from "./event.model";

export enum ConditionSymbolStart {
    OPEN_PAREN = '(',
    NOT = 'not'
}

export enum ConditionSymbolEnd {
    CLOSE_PAREN = ')',
    AND = 'and',
    OR = 'or'
}

export class ConditionModel {
    public name: string;
    public elementId: string;
    public elementType: ElementType;
    public operator: string;
    public value: ExecutableAction | number;
    public order: number;
    public symbolStart?: ConditionSymbolStart;
    public symbolEnd?: ConditionSymbolEnd;
}