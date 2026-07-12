import { TriggerModel } from '@process/domain/models/trigger.model';
import { Trigger, TriggerDocument } from '../trigger.schema';
import { ConditionMapper } from './condition.mapper';

export class TriggerMapper {

    public static mapToModel(trigger: TriggerDocument): TriggerModel {
        const model = new TriggerModel();
        model.id = trigger._id;
        model.cycleId = trigger.cycleId;
        model.name = trigger.name;
        model.description = trigger.description;
        model.conditions = (trigger.conditions ?? []).map(ConditionMapper.mapToModel);
        model.trigger = { timeAfter: trigger.trigger?.timeAfter, sunBehavior: trigger.trigger?.sunBehavior };
        model.delay = trigger.delay;
        model.shouldConfirmation = trigger.shouldConfirmation;
        model.duration = trigger.duration;
        model.lastTriggeredAt = trigger.lastTriggeredAt;
        model.isPaused = trigger.isPaused;
        model.action = trigger.action;
        model.isCheckInProgress = trigger.isCheckInProgress;
        model.createdAt = (trigger as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (trigger as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = trigger.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: TriggerModel): Trigger {
        const trigger = new Trigger();
        trigger.cycleId = model.cycleId;
        trigger.name = model.name;
        trigger.description = model.description;
        trigger.conditions = (model.conditions ?? []).map(ConditionMapper.mapToSchema);
        trigger.trigger = { timeAfter: model.trigger?.timeAfter, sunBehavior: model.trigger?.sunBehavior };
        trigger.delay = model.delay;
        trigger.shouldConfirmation = model.shouldConfirmation;
        trigger.duration = model.duration;
        trigger.lastTriggeredAt = model.lastTriggeredAt;
        trigger.isPaused = model.isPaused;
        trigger.action = model.action;
        trigger.isCheckInProgress = model.isCheckInProgress;
        return trigger;
    }

}
