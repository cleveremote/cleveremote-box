import { Module } from '@nestjs/common';
import { ActuatorModule } from '../actuator-strategies/actuator.module';
import { DeviceService } from '../device.service';
import { ModbusSlaveStrategy } from './modbus-slave.strategy';
import { InverterDeviceStrategy } from './inverter-device.strategy';
import { DEVICE_STRATEGIES, DeviceStrategy } from './device-strategy.interface';

@Module({
    imports: [ActuatorModule],
    providers: [
        DeviceService,
        ModbusSlaveStrategy,
        InverterDeviceStrategy,
        {
            provide: DEVICE_STRATEGIES,
            useFactory: (modbusSlave: ModbusSlaveStrategy, inverter: InverterDeviceStrategy): DeviceStrategy[] => [modbusSlave, inverter],
            inject: [ModbusSlaveStrategy, InverterDeviceStrategy]
        }
    ],
    exports: [DeviceService]
})
export class DeviceModule { }
