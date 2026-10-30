import { ControlLoopModel, PidParamsModel } from '@process/domain/models/control-loop.model';
import { ControlLoop, ControlLoopDocument } from '../control-loop.schema';

export class ControlLoopMapper {

    public static mapToModel(controlLoop: ControlLoopDocument): ControlLoopModel {
        const model = new ControlLoopModel();
        model._id = controlLoop._id;
        model.name = controlLoop.name;
        model.actuatorId = controlLoop.actuatorId;
        model.sensorId = controlLoop.sensorId;
        model.algorithm = controlLoop.algorithm;
        model.setpoint = controlLoop.setpoint;
        model.params = Object.assign(new PidParamsModel(), {
            kP: controlLoop.params?.kP,
            kI: controlLoop.params?.kI,
            kD: controlLoop.params?.kD,
            tolerance: controlLoop.params?.tolerance,
            maxIterations: controlLoop.params?.maxIterations,
            iterationDelayMs: controlLoop.params?.iterationDelayMs
        });
        model.isEnabled = controlLoop.isEnabled;
        model.createdAt = (controlLoop as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (controlLoop as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = controlLoop.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: ControlLoopModel): Omit<ControlLoop, '_id' | 'deletedAt'> {
        return {
            name: model.name,
            actuatorId: model.actuatorId,
            sensorId: model.sensorId,
            algorithm: model.algorithm,
            setpoint: model.setpoint,
            params: {
                kP: model.params?.kP,
                kI: model.params?.kI,
                kD: model.params?.kD,
                tolerance: model.params?.tolerance,
                maxIterations: model.params?.maxIterations,
                iterationDelayMs: model.params?.iterationDelayMs
            },
            isEnabled: model.isEnabled ?? true
        };
    }

}
