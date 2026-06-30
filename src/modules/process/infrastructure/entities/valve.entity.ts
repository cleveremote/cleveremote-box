import { ValveConfigModel } from '@process/domain/models/valve.model';

export class ValveEntity extends ValveConfigModel {

    public static mapToModel(valveEntity: ValveEntity): ValveConfigModel {
        const valve = new ValveConfigModel();
        valve.id = valveEntity.id;
        valve.name = valveEntity.name;
        valve.description = valveEntity.description;
        valve.connectionId = valveEntity.connectionId;
        valve.channel = valveEntity.channel;
        valve.flowMeterId = valveEntity.flowMeterId;
        valve.maxFlowRate = valveEntity.maxFlowRate;
        valve.kP = valveEntity.kP;
        valve.minOpening = valveEntity.minOpening;
        valve.maxOpening = valveEntity.maxOpening;
        valve.openingPercent = valveEntity.openingPercent;
        valve.tolerance = valveEntity.tolerance;
        valve.maxIterations = valveEntity.maxIterations;
        valve.iterationDelayMs = valveEntity.iterationDelayMs;
        return valve;
    }

    public static mapToEntity(valveModel: ValveConfigModel): ValveEntity {
        const valve = new ValveEntity();
        valve.id = valveModel.id;
        valve.name = valveModel.name;
        valve.description = valveModel.description;
        valve.connectionId = valveModel.connectionId;
        valve.channel = valveModel.channel;
        valve.flowMeterId = valveModel.flowMeterId;
        valve.maxFlowRate = valveModel.maxFlowRate;
        valve.kP = valveModel.kP;
        valve.minOpening = valveModel.minOpening;
        valve.maxOpening = valveModel.maxOpening;
        valve.openingPercent = valveModel.openingPercent;
        valve.tolerance = valveModel.tolerance;
        valve.maxIterations = valveModel.maxIterations;
        valve.iterationDelayMs = valveModel.iterationDelayMs;
        return valve;
    }

}
