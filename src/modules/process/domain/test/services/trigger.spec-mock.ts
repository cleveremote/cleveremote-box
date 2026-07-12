import { randomUUID } from 'node:crypto';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ExecutableAction } from '@process/domain/interfaces/executable.interface';

export function CreateTriggerModel(overrides: Partial<TriggerModel> = {}): TriggerModel {
    const trigger = new TriggerModel();
    trigger.id = randomUUID();
    trigger.cycleId = 'cycle-1';
    trigger.name = 'trigger';
    trigger.description = 'description';
    trigger.conditions = [];
    trigger.trigger = { timeAfter: 0 };
    trigger.action = ExecutableAction.ON;
    // Un delai nul reexposerait le trigger a un nouveau check des que
    // _planifyExecution boucle sur checkTriggerQueueProcess.next(), au risque de le
    // redeclencher indefiniment dans un test ou la condition reste vraie en continu.
    trigger.delay = 60 * 60 * 1000;
    trigger.shouldConfirmation = false;
    trigger.isPaused = false;
    return Object.assign(trigger, overrides);
}
