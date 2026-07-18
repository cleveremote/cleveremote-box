import { Types } from 'mongoose';
import { ExecutableAction } from '@process/domain/interfaces/executable.interface';
import { ConditionModel } from '@process/domain/models/condition.model';
import { Condition } from '../condition.schema';

export class ConditionMapper {

    public static mapToModel(condition: Condition & { _id?: Types.ObjectId }): ConditionModel {
        const model = new ConditionModel();
        model.name = condition.name;
        model.elementId = condition.elementId;
        model.elementType = condition.elementType;
        model.operator = condition.operator;
        model.value = condition.value as ExecutableAction | number;
        return model;
    }

    public static mapToSchema(model: ConditionModel): Condition {
        const condition = new Condition();
        condition.name = model.name;
        condition.elementId = model.elementId;
        condition.elementType = model.elementType;
        condition.operator = model.operator;
        condition.value = model.value;
        return condition; 
    }

}
