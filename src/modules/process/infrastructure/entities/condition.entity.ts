/* eslint-disable max-lines-per-function */
import { ConditionModel } from '@process/domain/models/condition.model';

export class ConditionEntity extends ConditionModel {

    public static mapToModel(conditionEntity: ConditionEntity): ConditionModel {
        const conditionModel = new ConditionModel();
        conditionModel.name = conditionEntity.name;
        conditionModel.elementId = conditionEntity.elementId;
        conditionModel.elementType = conditionEntity.elementType;
        conditionModel.operator = conditionEntity.operator;
        conditionModel.value = conditionEntity.value;
        return conditionModel;
    }

    public static mapToEntity(conditionModel: ConditionModel): ConditionEntity {
        const condition = new ConditionEntity();
        condition.name = conditionModel.name;
        condition.elementId = conditionModel.elementId;
        condition.elementType = conditionModel.elementType;
        condition.operator = conditionModel.operator;
        condition.value = conditionModel.value;
        return condition;
    }

}

