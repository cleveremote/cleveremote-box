import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sensor, SensorSchema } from '@process/infrastructure/schemas/sensor.schema';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { SensorMongooseRepository } from '@process/infrastructure/repositories/sensor-mongoose.repository';
import { ActuatorModule } from '../actuator-strategies/actuator.module';
import { SlaveScanService } from './scan/slave-scan.service';
import { AutoCreationService } from './auto-creation/auto-creation.service';
import { AutoCreationStrategyResolver } from './auto-creation/auto-creation-strategy.resolver';
import { SlaveBundlePersister } from './auto-creation/slave-bundle.persister';
import { AUTO_CREATION_STRATEGIES, AutoCreationStrategy } from './auto-creation/auto-creation-strategy.interface';
import { DigitalIoAutoCreationStrategy } from './auto-creation/strategies/digital-io-auto-creation.strategy';
import { AnalogInputAutoCreationStrategy } from './auto-creation/strategies/analog-input-auto-creation.strategy';
import { AnalogOutputAutoCreationStrategy } from './auto-creation/strategies/analog-output-auto-creation.strategy';
import { InverterAutoCreationStrategy } from './auto-creation/strategies/inverter-auto-creation.strategy';
import { SensorAutoCreationStrategy } from './auto-creation/strategies/sensor-auto-creation.strategy';
import { DeviceOnlyAutoCreationStrategy } from './auto-creation/strategies/device-only-auto-creation.strategy';

// Scan des masters et auto-création des slaves détectés ; un nouveau type = une stratégie ajoutée à AUTO_CREATION_STRATEGIES
@Module({
    imports: [
        MongooseModule.forFeature([{ name: Sensor.name, schema: SensorSchema }]),
        ActuatorModule
    ],
    providers: [
        // sensors créés depuis les champs autoCreate (SensorAutoCreationStrategy)
        SensorRepository,
        SensorMongooseRepository,
        SlaveScanService,
        AutoCreationService,
        AutoCreationStrategyResolver,
        SlaveBundlePersister,
        DigitalIoAutoCreationStrategy,
        AnalogInputAutoCreationStrategy,
        AnalogOutputAutoCreationStrategy,
        InverterAutoCreationStrategy,
        SensorAutoCreationStrategy,
        DeviceOnlyAutoCreationStrategy,
        {
            provide: AUTO_CREATION_STRATEGIES,
            useFactory: (
                digitalIo: DigitalIoAutoCreationStrategy,
                analogInput: AnalogInputAutoCreationStrategy,
                analogOutput: AnalogOutputAutoCreationStrategy,
                inverter: InverterAutoCreationStrategy,
                sensor: SensorAutoCreationStrategy
            ): AutoCreationStrategy[] => [digitalIo, analogInput, analogOutput, inverter, sensor],
            inject: [
                DigitalIoAutoCreationStrategy,
                AnalogInputAutoCreationStrategy,
                AnalogOutputAutoCreationStrategy,
                InverterAutoCreationStrategy,
                SensorAutoCreationStrategy
            ]
        }
    ],
    exports: [SlaveScanService, AutoCreationService]
})
export class SlaveProvisioningModule { }
