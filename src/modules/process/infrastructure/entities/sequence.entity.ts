/* eslint-disable max-lines-per-function */
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { ConditionModel } from '@process/domain/models/condition.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ModuleEntity } from './module.entity';
import { ConditionEntity } from './condition.entity';

export class SequenceEntity extends SequenceModel {

    public static mapToModel(sequenceEntity: SequenceEntity): SequenceModel {
        const sequence = new SequenceModel();
        sequence.id = sequenceEntity.id;
        sequence.name = sequenceEntity.name;
        sequence.description = sequenceEntity.description;
        sequence.mapSectionId = sequenceEntity.mapSectionId;
        sequence.status = sequenceEntity.status;
        sequence.maxDuration = sequenceEntity.maxDuration;
        sequence.modules = [];
        sequenceEntity.modules.forEach(moduleData => {
            sequence.modules.push(ModuleEntity.mapToModel(moduleData));
        });
        sequence.conditions = [];
        if (sequenceEntity.conditions?.length > 0) {
            sequenceEntity.conditions.forEach(conditionData => {
                sequence.conditions.push(ConditionEntity.mapToModel(conditionData));
            });
        }

        return sequence;
    }

    public static mapToEntity(sequenceModel: SequenceModel): SequenceEntity {
        const sequence = new SequenceEntity();
        sequence.id = sequenceModel.id;
        sequence.name = sequenceModel.name;
        sequence.description = sequenceModel.description;
        sequence.mapSectionId = sequenceModel.mapSectionId;
        sequence.status = sequenceModel.status;
        sequence.maxDuration = sequenceModel.maxDuration;
        sequence.modules = [];
        sequenceModel.modules.forEach(moduleData => {
            sequence.modules.push(ModuleEntity.mapToEntity(moduleData));
        });
        sequence.conditions = [];
        sequenceModel.conditions.forEach(conditionData => {
            sequence.conditions.push(ConditionEntity.mapToEntity(conditionData));
        });

        return sequence;
    }

}

