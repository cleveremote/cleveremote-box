import { ComActuatorConfigModel, ActuatorModel, RpiActuatorConfigModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorDocument, RpiActuatorConfig, ComActuatorConfig, CtrlActuatorConfig } from '../actuator.schema';

// forme attendue par les modeles Mongoose discriminants (ActuatorRpi/ActuatorCom/ActuatorCtrl,
// cf actuator.schema.ts) : un objet brut par type d'actionneur, sans champs d'un autre type.
export type ActuatorSchemaInput =
    | { type: ActuatorType.RPI; name: string; description?: string; status: ActuatorModel['status']; config: RpiActuatorConfig }
    | { type: ActuatorType.COM; name: string; description?: string; status: ActuatorModel['status']; config: ComActuatorConfig }
    | { type: ActuatorType.CTRL; name: string; description?: string; status: ActuatorModel['status']; config: CtrlActuatorConfig };

export class ActuatorMapper {

    public static mapToModel(actuator: ActuatorDocument): ActuatorModel {
        const model = new ActuatorModel();
        model._id = actuator._id;
        model.type = actuator.type;
        model.name = actuator.name;
        model.description = actuator.description;
        model.status = actuator.status;
        if (actuator.type === ActuatorType.RPI) {
            const rpiConfig = actuator.config as RpiActuatorConfig;
            const config = new RpiActuatorConfigModel();
            config.rpiPin = rpiConfig.rpiPin;
            config.direction = rpiConfig.direction;
            config.edge = rpiConfig.edge;
            config.activeLow = rpiConfig.activeLow;
            config.reconfigureDirection = rpiConfig.reconfigureDirection;
            config.debounceTimeout = rpiConfig.debounceTimeout;
            model.config = config;
        } else if (actuator.type === ActuatorType.COM) {
            const comConfig = actuator.config as ComActuatorConfig;
            const config = new ComActuatorConfigModel();
            config.deviceId = comConfig.deviceId;
            config.actions = (comConfig.actions ?? []).map((action) => ({
                comRequestId: action.comRequestId,
                action: action.action,
                digitalPort: action.digitalPort,
                type: action.type
            }));
            model.config = config;
        } else {
            const ctrlConfig = actuator.config as CtrlActuatorConfig;
            const config = new CtrlActuatorConfigModel();
            config.deviceId = ctrlConfig.deviceId;
            config.channel = ctrlConfig.channel;
            config.flowMeterId = ctrlConfig.flowMeterId;
            config.maxFlowRate = ctrlConfig.maxFlowRate;
            config.kP = ctrlConfig.kP;
            config.minOpening = ctrlConfig.minOpening;
            config.maxOpening = ctrlConfig.maxOpening;
            config.openingPercent = ctrlConfig.openingPercent;
            config.tolerance = ctrlConfig.tolerance;
            config.maxIterations = ctrlConfig.maxIterations;
            config.iterationDelayMs = ctrlConfig.iterationDelayMs;
            config.valveType = ctrlConfig.valveType;
            model.config = config;
        }
        model.createdAt = (actuator as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (actuator as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = actuator.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: ActuatorModel): ActuatorSchemaInput {
        const base = { name: model.name, description: model.description, status: model.status };
        if (model.type === ActuatorType.RPI) {
            const config = model.config as RpiActuatorConfigModel;
            return {
                ...base,
                type: ActuatorType.RPI,
                config: {
                    rpiPin: config.rpiPin,
                    direction: config.direction,
                    edge: config.edge,
                    activeLow: config.activeLow,
                    reconfigureDirection: config.reconfigureDirection,
                    debounceTimeout: config.debounceTimeout
                }
            };
        }
        if (model.type === ActuatorType.COM) {
            const config = model.config as ComActuatorConfigModel;
            return { ...base, type: ActuatorType.COM, config: { deviceId: config.deviceId, actions: config.actions } };
        }
        const config = model.config as CtrlActuatorConfigModel;
        return {
            ...base,
            type: ActuatorType.CTRL,
            config: {
                deviceId: config.deviceId,
                channel: config.channel,
                flowMeterId: config.flowMeterId,
                maxFlowRate: config.maxFlowRate,
                kP: config.kP,
                minOpening: config.minOpening,
                maxOpening: config.maxOpening,
                openingPercent: config.openingPercent,
                tolerance: config.tolerance,
                maxIterations: config.maxIterations,
                iterationDelayMs: config.iterationDelayMs,
                valveType: config.valveType
            }
        };
    }

}
