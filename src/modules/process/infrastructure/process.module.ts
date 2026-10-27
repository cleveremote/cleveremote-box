import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { watchMongoConnection } from '../../../common/database/mongo-connection.util';
import { Event, EventSchema } from './schemas/event.schema';
import { Authentication, AuthenticationSchema } from './schemas/authentication.schema';
import { GlobalSettings, GlobalSettingsSchema } from './schemas/global-settings.schema';
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
import { ValueRepository } from './repositories/value.repository';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationRepository } from './repositories/authentication.repository';
import { AuthenticationController } from './controllers/authentication.controller';
import { GlobalSettingsRepository } from './repositories/global-settings.repository';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { GlobalSettingsController } from './controllers/global-settings.controller';
import { EventRepository } from './repositories/event.repository';
import { EventMongooseRepository } from './repositories/event-mongoose.repository';
import { HttpModule } from '@nestjs/axios';
import { BleService } from '@process/domain/services/ble.service';
import { PingController } from './controllers/ping.controller';
import { SlaveTemplateService } from '@process/domain/services/slave-template.service';
import { SlaveTemplateController } from './controllers/slave-template.controller';
import { RegisterMapController } from './controllers/register-map.controller';
import { CycleGroupService } from '@process/domain/services/cycle-group.service';
import { ActuatorModule } from '@process/domain/services/actuator-strategies/actuator.module';
import { DeviceModule } from '@process/domain/services/device-strategies/device.module';
import { ForcastSensorStrategy } from '@process/domain/services/sensor-strategies/forcast-sensor.strategy';
import { ComSensorStrategy } from '@process/domain/services/sensor-strategies/com-sensor.strategy';
import { SENSOR_STRATEGIES, SensorStrategy } from '@process/domain/services/sensor-strategies/sensor-strategy.interface';
import { RegisterMapModule } from '@register-map/infrastructure/register-map.module';
import { SlaveProvisioningModule } from '@process/domain/services/slave-provisioning/slave-provisioning.module';
@Module({
    imports: [
        ConfigModule.forRoot(),
        ScheduleModule.forRoot(),
        HttpModule,
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const uri = config.get<string>('MONGO_URI');
                // echec rapide de chaque tentative (defaut 30s), les retries sont geres par watchMongoConnection
                const options = { serverSelectionTimeoutMS: 5000 };
                return {
                    uri,
                    ...options,
                    // ne pas bloquer le demarrage de l'app si Mongo est indisponible
                    lazyConnection: true,
                    connectionFactory: (connection: Connection) => watchMongoConnection(connection, uri, options)
                };
            }
        }),
        MongooseModule.forFeature([
            { name: Event.name, schema: EventSchema },
            { name: Authentication.name, schema: AuthenticationSchema },
            { name: GlobalSettings.name, schema: GlobalSettingsSchema }
        ]),
        ActuatorModule,
        DeviceModule,
        SlaveProvisioningModule,
        RegisterMapModule
    ],
    controllers: [
        ConfigurationController,
        ExecutionController,
        AuthenticationController,
        GlobalSettingsController,
        SlaveTemplateController,
        RegisterMapController,
        PingController
    ],
    providers: [
        //----Repositories------//
        AuthenticationRepository,
        GlobalSettingsRepository,
        ValueRepository,
        EventRepository,
        EventMongooseRepository,
        //---------------------//
        AuthenticationService,
        GlobalSettingsService,
        SlaveTemplateService,
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
