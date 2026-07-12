import { Connection } from 'mongoose';
import { ComActuatorAction, ComActuatorConfigModel, ActuatorModel, DigitalPortType, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import {
    Actuator, ActuatorSchema,
    ActuatorRpi, ActuatorRpiSchema,
    ActuatorCom, ActuatorComSchema,
    ActuatorCtrl, ActuatorCtrlSchema
} from '@process/infrastructure/schemas/actuator.schema';

// reproduit ce que MongooseModule.forFeature({ discriminators: [...] }) cable en production
// (cf actuator.module.ts), pour les tests qui construisent l'ActuatorMongooseRepository a la main
// plutot que via l'injection de dependances Nest.
export function CreateActuatorMongooseModels(connection: Connection) {
    const actuatorModel = connection.model(Actuator.name, ActuatorSchema);
    return {
        actuatorModel,
        actuatorRpiModel: actuatorModel.discriminator(ActuatorRpi.name, ActuatorRpiSchema, ActuatorType.RPI),
        actuatorComModel: actuatorModel.discriminator(ActuatorCom.name, ActuatorComSchema, ActuatorType.COM),
        actuatorCtrlModel: actuatorModel.discriminator(ActuatorCtrl.name, ActuatorCtrlSchema, ActuatorType.CTRL)
    };
}

export function CreateActuatorRpiModel(direction: GPIODirection = GPIODirection.OUT, portNum = 16, rpiPin = portNum): ActuatorModel {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.RPI;
    actuator.name = String(portNum);
    actuator.status = ModuleStatus.OFF;
    actuator.config = new RpiActuatorConfigModel();
    actuator.config.rpiPin = rpiPin;
    actuator.config.direction = direction;
    actuator.config.edge = GPIOEdge.BOTH;
    return actuator;
}

export function CreateActuatorComModel(portNum = 30): ActuatorModel {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.COM;
    actuator.name = String(portNum);
    actuator.status = ModuleStatus.OFF;
    actuator.config = new ComActuatorConfigModel();
    actuator.config.deviceId = 'com-module-1';
    actuator.config.actions = [{ comRequestId: 'req-1', action: ComActuatorAction.ON, digitalPort: 1, type: DigitalPortType.OUTPUT }];
    return actuator;
}
