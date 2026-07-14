import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Cycle, CycleSchema } from './schemas/cycle.schema';
import { Sequence, SequenceSchema } from './schemas/sequence.schema';
import { Schedule, ScheduleSchema } from './schemas/schedule.schema';
import { Trigger, TriggerSchema } from './schemas/trigger.schema';
import { Sensor, SensorSchema } from './schemas/sensor.schema';
import { Event, EventSchema } from './schemas/event.schema';
import { Authentication, AuthenticationSchema } from './schemas/authentication.schema';
import { SocketIoClientProxyService } from '../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { SocketIoClientProvider } from '../../../common/websocket/socket-io-client.provider';
import { ProcessService } from '@process/domain/services/execution.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { ConfigurationController } from './controllers/configuration.controller';
import { ExecutionController } from './controllers/execution.controller';
import { InitService } from '@process/domain/services/init.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { TriggerService } from '@process/domain/services/trigger.service';
import { SensorService } from '@process/domain/services/sensor.service';
import { CycleRepository } from './repositories/cycle.repository';
import { SequenceRepository } from './repositories/sequence.repository';
import { TriggerRepository } from './repositories/trigger.repository';
import { ScheduleRepository } from './repositories/schedule.repository';
import { SensorRepository } from './repositories/sensor.repository';
import { ValueRepository } from './repositories/value.repository';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationRepository } from './repositories/authentication.repository';
import { AuthenticationController } from './controllers/authentication.controller';
import { EventRepository } from './repositories/event.repository';
import { EventMongooseRepository } from './repositories/event-mongoose.repository';
import { HttpModule } from '@nestjs/axios';
import { BleService } from '@process/domain/services/ble.service';
import { PingController } from './controllers/ping.controller';
import { CycleMongooseRepository } from './repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from './repositories/sequence-mongoose.repository';
import { ScheduleMongooseRepository } from './repositories/schedule-mongoose.repository';
import { TriggerMongooseRepository } from './repositories/trigger-mongoose.repository';
import { SensorMongooseRepository } from './repositories/sensor-mongoose.repository';
import { CycleGroupService } from '@process/domain/services/cycle-group.service';
import { ActuatorModule } from '@process/domain/services/actuator-strategies/actuator.module';
import { DeviceModule } from '@process/domain/services/device-strategies/device.module';
import { ForcastSensorStrategy } from '@process/domain/services/sensor-strategies/forcast-sensor.strategy';
import { ComSensorStrategy } from '@process/domain/services/sensor-strategies/com-sensor.strategy';
import { SENSOR_STRATEGIES, SensorStrategy } from '@process/domain/services/sensor-strategies/sensor-strategy.interface';
@Module({
    imports: [
        ConfigModule.forRoot(),
        ScheduleModule.forRoot(),
        HttpModule,
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                uri: config.get<string>('MONGO_URI')
            })
        }),
        MongooseModule.forFeature([
            { name: Cycle.name, schema: CycleSchema },
            { name: Sequence.name, schema: SequenceSchema },
            { name: Schedule.name, schema: ScheduleSchema },
            { name: Trigger.name, schema: TriggerSchema },
            { name: Sensor.name, schema: SensorSchema },
            { name: Event.name, schema: EventSchema },
            { name: Authentication.name, schema: AuthenticationSchema }
        ]),
        ActuatorModule,
        DeviceModule
    ],
    controllers: [
        ConfigurationController,
        ExecutionController,
        AuthenticationController,
        PingController
    ],
    providers: [
        //----Repositories------//
        AuthenticationRepository,
        CycleRepository,
        SequenceRepository,
        TriggerRepository,
        ScheduleRepository,
        SensorRepository,
        ValueRepository,
        EventRepository,
        EventMongooseRepository,
        CycleMongooseRepository,
        SequenceMongooseRepository,
        ScheduleMongooseRepository,
        TriggerMongooseRepository,
        SensorMongooseRepository,
        //---------------------//
        AuthenticationService,
        StructureService,
        ProcessService,
        SocketIoClientProvider,
        SocketIoClientProxyService,
        InitService,
        SynchronizeService,
        ScheduleService,
        TriggerService,
        SensorService,
        ForcastSensorStrategy,
        ComSensorStrategy,
        {
            provide: SENSOR_STRATEGIES,
            useFactory: (forcast: ForcastSensorStrategy, com: ComSensorStrategy): SensorStrategy[] => [forcast, com],
            inject: [ForcastSensorStrategy, ComSensorStrategy]
        },
        BleService,
        CycleGroupService
    ],
    exports: [
        ProcessService,
        InitService
    ]
})
export class ProcessModule { }
