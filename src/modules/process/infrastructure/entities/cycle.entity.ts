/* eslint-disable max-lines-per-function */
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { ConditionModel } from '@process/domain/models/condition.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { SequenceEntity } from './sequence.entity';
import { ScheduleEntity } from './schedule.entity';
import { TriggerEntity } from './trigger.entity';

export class CycleEntity extends CycleModel {

    public static mapToModel(cycleEntity: CycleEntity): CycleModel {
        const cycle = new CycleModel();
        cycle.id = cycleEntity.id;
        cycle.status = ExecutableStatus.STOPPED;
        cycle.name = cycleEntity.name;
        cycle.description = cycleEntity.description;
       cycle.mapSectionId = cycleEntity.mapSectionId;
        cycle.style = cycleEntity.style;
        cycle.modePriority = [];
        cycleEntity.modePriority.forEach((mode) => {
            cycle.modePriority.push(mode);
        })

        cycleEntity.sequences.forEach(sequenceData => {
            cycle.sequences.push(SequenceEntity.mapToModel(sequenceData));
        });

        cycleEntity.schedules.forEach(scheduleData => {
            cycle.schedules.push(ScheduleEntity.mapToModel(scheduleData));
        });

        cycleEntity.triggers.forEach(triggerData => {
            cycle.triggers.push(TriggerEntity.mapToModel(triggerData));
        });

        return cycle;
    }

    public static mapToEntity(cycleModel: CycleModel): CycleEntity {
        const cycle = new CycleEntity();
        cycle.id = cycleModel.id;
        cycle.status = ExecutableStatus.STOPPED;
        cycle.name = cycleModel.name;
        cycle.description = cycleModel.description;
        cycle.mapSectionId = cycleModel.mapSectionId;
        cycle.style = cycleModel.style;
        cycle.modePriority = [];
        cycleModel.modePriority.forEach((mode) => {
            cycle.modePriority.push(mode);
        })

        cycleModel.sequences.forEach(sequenceData => {
            cycle.sequences.push(SequenceEntity.mapToEntity(sequenceData));
        });

        cycleModel.schedules.forEach(scheduleData => {
            cycle.schedules.push(ScheduleEntity.mapToEntity(scheduleData));
        });

        cycleModel.triggers.forEach(triggerData => {
            cycle.triggers.push(TriggerEntity.mapToEntity(triggerData));
        });

        return cycle;
    }

}

