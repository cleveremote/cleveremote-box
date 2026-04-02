import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocketIoClientProxyService } from '../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { SocketIoClientProvider } from '../../../common/websocket/socket-io-client.provider';
import { ProcessService } from '@process/domain/services/execution.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { ConfigurationController } from './controllers/configuration.controller';
import { StructureRepository } from './repositories/structure.repository';
import { ExecutionController } from './controllers/execution.controller';
import { InitService } from '@process/domain/services/init.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { TriggerService } from '@process/domain/services/trigger.service';
import { SensorService } from '@process/domain/services/sensor.service';
import { DbService } from './db/db.service';
import { CycleRepository } from './repositories/cycle.repository';
import { TriggerRepository } from './repositories/trigger.repository';
import { ScheduleRepository } from './repositories/schedule.repository';
import { SensorRepository } from './repositories/sensor.repository';
import { ProcessValueRepository } from './repositories/process-value.repository';
import { SensorValueRepository } from './repositories/sensor-value.repository';
import { ValueRepository } from './repositories/value.repository';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationRepository } from './repositories/authentication.repository';
import { AuthenticationController } from './controllers/authentication.controller';
import { DataRepository } from './repositories/data.repository';
import { HttpModule } from '@nestjs/axios';
import { BleService } from '@process/domain/services/ble.service';
import { PingController } from './controllers/ping.controller';
import { ModbusConnectionRepository } from './repositories/modbusConnection.repository';
import { ModbusTaskRepository } from './repositories/modbusTask.repository';
import { ModbusTaskService } from '@process/domain/services/modbus-task.service';
@Module({
    imports: [
        ConfigModule.forRoot(),
        ScheduleModule.forRoot(),
        HttpModule
    ],
    controllers: [
        ConfigurationController,
        ExecutionController,
        AuthenticationController,
        PingController
    ],
    providers: [
        DbService,
        //----Repositories------//
        AuthenticationRepository,
        CycleRepository,
        TriggerRepository,
        ScheduleRepository,
        StructureRepository,
        SensorRepository,
        ProcessValueRepository,
        SensorValueRepository,
        ValueRepository,
        DataRepository,
        ModbusConnectionRepository,
        ModbusTaskRepository,
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
        BleService,
        ModbusTaskService
    ],
    exports: [
        ProcessService,
        InitService
    ]
})
export class ProcessModule { }