import { ComActuatorConfigModel, ActuatorModel, RpiActuatorConfigModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';

export class ActuatorEntity extends ActuatorModel {

    public static mapToModel(actuatorEntity: ActuatorEntity): ActuatorModel {
        const model = new ActuatorModel();
        model._id = actuatorEntity._id;
        model.type = actuatorEntity.type;
        model.status = actuatorEntity.status;
        model.name = actuatorEntity.name;
        model.description = actuatorEntity.description;
        model.config = ActuatorEntity._copyConfig(actuatorEntity.type, actuatorEntity.config);
        return model;
    }

    public static mapToEntity(actuatorModel: ActuatorModel): ActuatorEntity {
        const entity = new ActuatorEntity();
        entity._id = actuatorModel._id;
        entity.type = actuatorModel.type;
        entity.status = actuatorModel.status;
        entity.name = actuatorModel.name;
        entity.description = actuatorModel.description;
        entity.config = ActuatorEntity._copyConfig(actuatorModel.type, actuatorModel.config);
        return entity;
    }

    private static _copyConfig(
        type: ActuatorType,
        config: RpiActuatorConfigModel | ComActuatorConfigModel | CtrlActuatorConfigModel
    ): RpiActuatorConfigModel | ComActuatorConfigModel | CtrlActuatorConfigModel {
        if (type === ActuatorType.RPI) {
            return Object.assign(new RpiActuatorConfigModel(), config as RpiActuatorConfigModel);
        }
        if (type === ActuatorType.COM) {
            return Object.assign(new ComActuatorConfigModel(), config as ComActuatorConfigModel);
        }
        return Object.assign(new CtrlActuatorConfigModel(), config as CtrlActuatorConfigModel);
    }

}
