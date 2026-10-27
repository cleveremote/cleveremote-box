import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Actuator, ActuatorSchema,
    ActuatorRpi, ActuatorRpiSchema,
    ActuatorCom, ActuatorComSchema,
    ActuatorCtrl, ActuatorCtrlSchema
} from '@process/infrastructure/schemas/actuator.schema';
import { Device, DeviceSchema } from '@process/infrastructure/schemas/device.schema';
import { DeviceCommand, DeviceCommandSchema } from '@process/infrastructure/schemas/device-command.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { SlaveTemplate, SlaveTemplateSchema } from '@process/infrastructure/schemas/slave-template.schema';
import { Sensor, SensorSchema } from '@process/infrastructure/schemas/sensor.schema';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceMongooseRepository } from '@process/infrastructure/repositories/device-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { DeviceCommandRepository } from '@process/infrastructure/repositories/device-command.repository';
import { DeviceCommandMongooseRepository } from '@process/infrastructure/repositories/device-command-mongoose.repository';
import { SlaveTemplateRepository } from '@process/infrastructure/repositories/slave-template.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { SensorMongooseRepository } from '@process/infrastructure/repositories/sensor-mongoose.repository';
import { DeviceCommandService } from '@process/domain/services/device-command.service';
import { RegisterMapModule } from '@register-map/infrastructure/register-map.module';
import { ModbusDeviceService } from '@process/domain/services/modbus-device.service';
import { WaveshareDiscoveryService } from '@process/domain/services/waveshare-discovery.service';
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
            { name: DeviceCommand.name, schema: DeviceCommandSchema },
            { name: Sequence.name, schema: SequenceSchema },
            { name: Cycle.name, schema: CycleSchema },
            { name: Schedule.name, schema: ScheduleSchema },
            { name: Trigger.name, schema: TriggerSchema },
            { name: SlaveTemplate.name, schema: SlaveTemplateSchema },
            { name: Sensor.name, schema: SensorSchema }
        ]),
        RegisterMapModule
    ],
    providers: [
        ActuatorService,
        ActuatorRepository,
        ActuatorMongooseRepository,
        DeviceRepository,
        DeviceMongooseRepository,
        // DeviceRepository.delete supprime les sensors lus sur un slave capteur
        SensorRepository,
        SensorMongooseRepository,
        DeviceCommandRepository,
        DeviceCommandMongooseRepository,
        SlaveTemplateRepository,
        DeviceCommandService,
        SequenceMongooseRepository,
        // ActuatorRepository.delete supprime les cycles MODULE devenus sans module
        CycleRepository,
        CycleMongooseRepository,
        SequenceRepository,
        ScheduleRepository,
        ScheduleMongooseRepository,
        TriggerRepository,
        TriggerMongooseRepository,
        ModbusDeviceService,
        WaveshareDiscoveryService,
        RpiActuatorStrategy,
        ComActuatorStrategy,
        CtrlActuatorStrategy,
        {
            provide: ACTUATOR_STRATEGIES,
            useFactory: (rpi: RpiActuatorStrategy, com: ComActuatorStrategy, ctrl: CtrlActuatorStrategy): ActuatorStrategy[] => [rpi, com, ctrl],
            inject: [RpiActuatorStrategy, ComActuatorStrategy, CtrlActuatorStrategy]
        }
    ],
    exports: [
        ActuatorService, ActuatorRepository, DeviceRepository, SensorRepository, DeviceCommandRepository, SlaveTemplateRepository, DeviceCommandService,
        ModbusDeviceService, WaveshareDiscoveryService, CtrlActuatorStrategy,
        CycleRepository, CycleMongooseRepository, SequenceRepository, ScheduleRepository, TriggerRepository
    ]
})
export class ActuatorModule { }
