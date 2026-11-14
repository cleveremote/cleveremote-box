import { ExecutableAction } from '@process/domain/interfaces/executable.interface';
import {
    ConditionConnector, ConditionModel, ConditionOperator, ConditionSymbolEnd, ConditionSymbolStart
} from '@process/domain/models/condition.model';
import { ElementType } from '@process/domain/models/event.model';
import { sortConditions } from '@process/domain/utils/evaluate-conditions.util';
import { Condition } from '../condition.schema';

export class ConditionMapper {

    public static mapToModel(condition: Condition): ConditionModel {
        const model = new ConditionModel();
        model.elementId = condition.elementId;
        model.elementType = condition.elementType;
        model.operator = ConditionMapper._normalizeOperator(condition.operator);
        model.value = ConditionMapper._normalizeValue(condition);
        model.order = condition.order;
        model.connector = condition.connector;
        model.symbolStart = condition.symbolStart === ConditionSymbolStart.OPEN_PAREN ? ConditionSymbolStart.OPEN_PAREN : ConditionSymbolStart.NONE;
        model.symbolEnd = condition.symbolEnd === ConditionSymbolEnd.CLOSE_PAREN ? ConditionSymbolEnd.CLOSE_PAREN : ConditionSymbolEnd.NONE;
        model.parentId = condition.parentId;
        model.parentType = condition.parentType;
        return model;
    }

    // Mappe une liste en convertissant l'ancien format (and/or portes par symbolEnd de la condition
    // precedente) vers le nouveau (connector porte par la condition suivante).
    public static mapListToModel(conditions: Condition[] | undefined): ConditionModel[] {
        const ordered = sortConditions(conditions ?? []);
        let pendingConnector: ConditionConnector | undefined;
        // ancien format : order absent ou en double -> rendait la structure invalide (evaluation toujours false)
        const orders = ordered.map((c) => c.order);
        const hasInvalidOrders = orders.some((o) => typeof o !== 'number') || new Set(orders).size !== orders.length;
        return ordered.map((condition, index) => {
            const model = ConditionMapper.mapToModel(condition);
            if (hasInvalidOrders) { model.order = index; }
            if (model.connector === undefined && index > 0) {
                model.connector = pendingConnector ?? ConditionConnector.AND;
            }
            const legacyEnd = condition.symbolEnd;
            pendingConnector = legacyEnd === ConditionConnector.AND || legacyEnd === ConditionConnector.OR ? legacyEnd : undefined;
            return model;
        });
    }

    // ancien format : '==' (syntaxe mathjs) au lieu de '='
    private static _normalizeOperator(operator: string): ConditionOperator {
        return (operator === '==' ? ConditionOperator.EQ : operator) as ConditionOperator;
    }

    // ancien format : statut CYCLE/SEQUENCE compare en 0/1 au lieu de OFF/ON
    private static _normalizeValue(condition: Condition): string | number {
        if (condition.elementType === ElementType.SENSOR) { return condition.value; }
        if (condition.value === 0 || condition.value === '0') { return ExecutableAction.OFF; }
        if (condition.value === 1 || condition.value === '1') { return ExecutableAction.ON; }
        return condition.value;
    }

    public static mapToSchema(model: ConditionModel): Condition {
        const condition = new Condition();
        condition.elementId = model.elementId;
        condition.elementType = model.elementType;
        condition.operator = model.operator;
        condition.value = model.value;
        condition.order = model.order;
        condition.connector = model.connector;
        condition.symbolStart = model.symbolStart ?? ConditionSymbolStart.NONE;
        condition.symbolEnd = model.symbolEnd ?? ConditionSymbolEnd.NONE;
        condition.parentId = model.parentId;
        condition.parentType = model.parentType;
        return condition;
    }

}
