/* eslint-disable max-lines-per-function */
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ConditionEntity } from './condition.entity';

export class TriggerEntity extends TriggerModel {

    public static mapToModel(triggerEntity: TriggerEntity): TriggerModel {
        const trigger = new TriggerModel();
        trigger.id = triggerEntity.id;
        trigger.action = triggerEntity.action;
        trigger.cycleId = triggerEntity.cycleId;
        trigger.name = triggerEntity.name;
        trigger.description = triggerEntity.description;
        trigger.trigger = { timeAfter: triggerEntity.trigger.timeAfter, sunBehavior: triggerEntity.trigger.sunBehavior };
        trigger.conditions = triggerEntity.conditions;
        trigger.isPaused = triggerEntity.isPaused;
        trigger.shouldConfirmation = triggerEntity.shouldConfirmation;
        trigger.delay = triggerEntity.delay;
        trigger.lastTriggeredAt = triggerEntity.lastTriggeredAt;
        trigger.conditions = [];
        triggerEntity.conditions.forEach(conditionData => {
            trigger.conditions.push(ConditionEntity.mapToModel(conditionData))
        });
        return trigger;
    }

    public static mapToEntity(triggerModel: TriggerModel): TriggerEntity {
        const trigger = new TriggerEntity();
        trigger.id = triggerModel.id;
        trigger.cycleId = triggerModel.cycleId;
        trigger.name = triggerModel.name;
        trigger.description = triggerModel.description;
        trigger.trigger = { timeAfter: triggerModel.trigger.timeAfter, sunBehavior: triggerModel.trigger.sunBehavior };
        trigger.isPaused = triggerModel.isPaused;
        trigger.shouldConfirmation = triggerModel.shouldConfirmation;
        trigger.delay = triggerModel.delay;
        trigger.lastTriggeredAt = triggerModel.lastTriggeredAt;
        trigger.action = triggerModel.action;
        trigger.conditions = [];
        triggerModel.conditions.forEach(conditionData => {
            trigger.conditions.push(ConditionEntity.mapToEntity(conditionData));
        });
        return trigger;
    }

}

