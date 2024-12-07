/* eslint-disable max-lines-per-function */
import { ConditionModel } from '@process/domain/models/condition.model';

export class ConditionEntity extends ConditionModel {

    public static mapToModel(conditionEntity: ConditionEntity): ConditionModel {
        const conditionModel = new ConditionModel();
        conditionModel.id = conditionEntity.id;
        conditionModel.parentId = conditionEntity.parentId;
        conditionModel.name = conditionEntity.name;
        conditionModel.description = conditionEntity.description;
        conditionModel.deviceId = conditionEntity.deviceId;
        conditionModel.operator = conditionEntity.operator;
        conditionModel.value = conditionEntity.value;
        return conditionModel;
    }

    public static mapToEntity(conditionModel: ConditionModel): ConditionEntity {
        const condition = new ConditionEntity();
        condition.id = conditionModel.id;
        condition.parentId = conditionModel.parentId;
        condition.name = conditionModel.name;
        condition.description = conditionModel.description;
        condition.deviceId = conditionModel.deviceId;
        condition.operator = conditionModel.operator;
        condition.value = conditionModel.value;
        return condition;
    }

}

