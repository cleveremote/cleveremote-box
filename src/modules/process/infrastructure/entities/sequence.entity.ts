/* eslint-disable max-lines-per-function */
import { SequenceModel } from '@process/domain/models/sequence.model';
import { ConditionEntity } from './condition.entity';

export class SequenceEntity extends SequenceModel {

    public static mapToModel(sequenceEntity: SequenceEntity): SequenceModel {
        const sequence = new SequenceModel();
        sequence._id = sequenceEntity._id;
        sequence.name = sequenceEntity.name;
        sequence.description = sequenceEntity.description;
        sequence.status = sequenceEntity.status;
        sequence.order = sequenceEntity.order;
        sequence.securityConfig = {
            maxDuration: sequenceEntity.securityConfig?.maxDuration,
            ...(sequenceEntity.securityConfig?.customStack !== undefined && { customStack: sequenceEntity.securityConfig.customStack }),
            ...(sequenceEntity.securityConfig?.conditions !== undefined && {
                conditions: sequenceEntity.securityConfig.conditions.map(conditionData => ConditionEntity.mapToModel(conditionData))
            })
        };

        return sequence;
    }

    public static mapToEntity(sequenceModel: SequenceModel): SequenceEntity {
        const sequence = new SequenceEntity();
        sequence._id = sequenceModel._id;
        sequence.name = sequenceModel.name;
        sequence.description = sequenceModel.description;
        sequence.status = sequenceModel.status;
        sequence.order = sequenceModel.order;
        sequence.securityConfig = {
            maxDuration: sequenceModel.securityConfig.maxDuration,
            ...(sequenceModel.securityConfig.customStack !== undefined && { customStack: sequenceModel.securityConfig.customStack }),
            ...(sequenceModel.securityConfig.conditions !== undefined && {
                conditions: sequenceModel.securityConfig.conditions.map(conditionData => ConditionEntity.mapToEntity(conditionData))
            })
        };

        return sequence;
    }

}
