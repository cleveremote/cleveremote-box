import { SequenceModel } from '@process/domain/models/sequence.model';
import { SequenceInverterDirective } from '@process/domain/models/inverter.model';
import { Sequence, SequenceDocument } from '../sequence.schema';
import { ConditionMapper } from './condition.mapper';
import { CustomStackMapper } from './custom-stack.mapper';

// les modules physiques vivent dans leur propre collection, partageables entre sequences :
// seul moduleConfigs (moduleId + cfg de timing propre a cet usage) est persiste ici ; les
// instances d'actionneurs sont resolues a la demande via ActuatorService.resolve(moduleId).
export class SequenceMapper {

    public static mapToModel(sequence: SequenceDocument): SequenceModel {
        const model = new SequenceModel();
        model._id = sequence._id;
        model.cycleId = sequence.cycleId;
        model.name = sequence.name;
        model.description = sequence.description;
        model.status = sequence.status;
        model.order = sequence.order;
        model.securityConfig = {
            maxDuration: sequence.securityConfig?.maxDuration,
            ...(sequence.securityConfig?.customStacks !== undefined && { customStacks: sequence.securityConfig.customStacks.map(CustomStackMapper.mapToModel) }),
            ...(sequence.securityConfig?.conditions !== undefined && { conditions: ConditionMapper.mapListToModel(sequence.securityConfig.conditions) })
        };
        model.moduleConfigs = (sequence.moduleConfigs ?? []).map((ref) => ({
            moduleId: ref.moduleId,
            configTiming: {
                waitBeforeExec: ref.configTiming?.waitBeforeExec ?? 0,
                waitAfterExec: ref.configTiming?.waitAfterExec ?? 0,
                waitBeforeExecOff: ref.configTiming?.waitBeforeExecOff ?? 0,
                waitAfterExecOff: ref.configTiming?.waitAfterExecOff ?? 0
            },
            ...(ref.customValue !== undefined && { customValue: ref.customValue })
        }));
        if (sequence.inverterDirectives !== undefined && sequence.inverterDirectives !== null) {
            model.inverterDirectives = sequence.inverterDirectives.map(SequenceMapper._directive);
        }
        model.createdAt = (sequence as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (sequence as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = sequence.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: SequenceModel): Sequence {
        const sequence = new Sequence();
        sequence.cycleId = model.cycleId;
        sequence.name = model.name;
        sequence.description = model.description;
        sequence.status = model.status;
        sequence.order = model.order;
        sequence.securityConfig = {
            maxDuration: model.securityConfig.maxDuration,
            ...(model.securityConfig.customStacks !== undefined && { customStacks: model.securityConfig.customStacks.map(CustomStackMapper.mapToSchema) }),
            ...(model.securityConfig.conditions !== undefined && { conditions: model.securityConfig.conditions.map(ConditionMapper.mapToSchema) })
        };
        sequence.moduleConfigs = (model.moduleConfigs ?? []).map((ref) => ({
            moduleId: ref.moduleId,
            configTiming: {
                waitBeforeExec: ref.configTiming?.waitBeforeExec ?? 0,
                waitAfterExec: ref.configTiming?.waitAfterExec ?? 0,
                waitBeforeExecOff: ref.configTiming?.waitBeforeExecOff ?? 0,
                waitAfterExecOff: ref.configTiming?.waitAfterExecOff ?? 0
            },
            ...(ref.customValue !== undefined && { customValue: ref.customValue })
        }));
        if (model.inverterDirectives !== undefined) {
            sequence.inverterDirectives = model.inverterDirectives.map(SequenceMapper._directive);
        }
        return sequence;
    }

    // clés absentes (pas undefined) : sinon persistées à null
    private static _directive(directive: SequenceInverterDirective): SequenceInverterDirective {
        return {
            inverterId: directive.inverterId,
            mode: directive.mode,
            ...(directive.frequency !== undefined && directive.frequency !== null && { frequency: directive.frequency }),
            ...(directive.pidSetpoint !== undefined && directive.pidSetpoint !== null && { pidSetpoint: directive.pidSetpoint })
        };
    }

}
