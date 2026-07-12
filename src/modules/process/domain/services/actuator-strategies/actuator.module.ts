import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Actuator, ActuatorSchema,
    ActuatorRpi, ActuatorRpiSchema,
    ActuatorCom, ActuatorComSchema,
    ActuatorCtrl, ActuatorCtrlSchema
} from '@process/infrastructure/schemas/actuator.schema';
import { Device, DeviceSchema } from '@process/infrastructure/schemas/device.schema';
import { ComRequest, ComRequestSchema } from '@process/infrastructure/schemas/comrequest.schema';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceMongooseRepository } from '@process/infrastructure/repositories/device-mongoose.repository';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ComRequestkMongooseRepository } from '@process/infrastructure/repositories/com-request-mongoose.repository';
import { ModbusTaskService } from '@process/domain/services/modbus-task.service';
import { ActuatorService } from '../actuator.service';
import { RpiActuatorStrategy } from './rpi-actuator.strategy';
import { ComActuatorStrategy } from './com-actuator.strategy';
import { CtrlActuatorStrategy } from './ctrl-actuator.strategy';
import { ACTUATOR_STRATEGIES, ActuatorStrategy } from './actuator-strategy.interface';

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: Actuator.name,
                schema: ActuatorSchema,
                discriminators: [
                    { name: ActuatorRpi.name, schema: ActuatorRpiSchema, value: ActuatorType.RPI },
                    { name: ActuatorCom.name, schema: ActuatorComSchema, value: ActuatorType.COM },
                    { name: ActuatorCtrl.name, schema: ActuatorCtrlSchema, value: ActuatorType.CTRL }
                ]
            },
            { name: Device.name, schema: DeviceSchema },
            { name: ComRequest.name, schema: ComRequestSchema }
        ])
    ],
    providers: [
        ActuatorService,
        ActuatorRepository,
        ActuatorMongooseRepository,
        DeviceRepository,
        DeviceMongooseRepository,
        ComRequestRepository,
        ComRequestkMongooseRepository,
        ModbusTaskService,
        RpiActuatorStrategy,
        ComActuatorStrategy,
        CtrlActuatorStrategy,
        {
            provide: ACTUATOR_STRATEGIES,
            useFactory: (rpi: RpiActuatorStrategy, com: ComActuatorStrategy, ctrl: CtrlActuatorStrategy): ActuatorStrategy[] => [rpi, com, ctrl],
            inject: [RpiActuatorStrategy, ComActuatorStrategy, CtrlActuatorStrategy]
        }
    ],
    exports: [ActuatorService, ActuatorRepository, DeviceRepository, ComRequestRepository, ModbusTaskService, CtrlActuatorStrategy]
})
export class ActuatorModule { }
