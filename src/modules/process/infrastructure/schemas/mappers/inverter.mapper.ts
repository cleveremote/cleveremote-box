import { InverterMode, InverterModel, InverterParameterModel } from '@process/domain/models/inverter.model';
import { Inverter, InverterDocument } from '../inverter.schema';

export class InverterMapper {

    public static mapToModel(inverter: InverterDocument): InverterModel {
        const model = new InverterModel();
        model._id = inverter._id;
        model.name = inverter.name;
        model.description = inverter.description;
        model.deviceId = inverter.deviceId;
        model.profile = inverter.profile;
        model.commands = { ...(inverter.commands ?? {}) };
        model.parameters = (inverter.parameters ?? []).map((parameter) => Object.assign(new InverterParameterModel(), {
            blockId: parameter.blockId,
            field: parameter.field,
            readCommandId: parameter.readCommandId,
            setCommandId: parameter.setCommandId,
            ...(parameter.value !== undefined && parameter.value !== null && { value: parameter.value }),
            isPersistent: parameter.isPersistent ?? true
        }));
        model.manualSensorId = inverter.manualSensorId;
        model.defaultMode = inverter.defaultMode ?? InverterMode.PID;
        model.releaseGraceMs = inverter.releaseGraceMs ?? 3000;
        model.createdAt = (inverter as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (inverter as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = inverter.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: InverterModel): Omit<Inverter, '_id' | 'deletedAt'> {
        return {
            name: model.name,
            description: model.description,
            deviceId: model.deviceId,
            profile: model.profile,
            commands: { ...(model.commands ?? {}) },
            parameters: (model.parameters ?? []).map((parameter) => ({
                blockId: parameter.blockId,
                field: parameter.field,
                readCommandId: parameter.readCommandId,
                setCommandId: parameter.setCommandId,
                ...(parameter.value !== undefined && { value: parameter.value }),
                isPersistent: parameter.isPersistent ?? true
            })),
            manualSensorId: model.manualSensorId,
            defaultMode: model.defaultMode ?? InverterMode.PID,
            releaseGraceMs: model.releaseGraceMs ?? 3000
        };
    }

}
