import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { DeviceModel, DeviceKind } from '../../models/device.model';
import { DeviceStrategy } from './device-strategy.interface';
import { DeviceCommandService } from '../device-command.service';

@Injectable()
export class ModbusSlaveStrategy implements DeviceStrategy {
    public readonly kind = DeviceKind.MODBUS_SLAVE;

    public constructor(private deviceCommandService: DeviceCommandService) { }

    // commandes d'init (DeviceCommand init) non encore appliquées
    public async init(device: DeviceModel): Promise<void> {
        await this.deviceCommandService.runInitCommands(device._id);
    }

    // commandes reset puis rejoue toutes les commandes d'init
    public async reset(device: DeviceModel): Promise<void> {
        await this.deviceCommandService.runResetCommands(device._id);
    }

    public async configure(device: DeviceModel): Promise<void> {
        throw new NotImplementedError(`ModbusSlaveStrategy.configure is not implemented yet (deviceId: ${device._id})`);
    }

    public async write(device: DeviceModel, params: { name: string; value: number }): Promise<void> {
        throw new NotImplementedError(`ModbusSlaveStrategy.write is not implemented yet (deviceId: ${device._id}, value: ${params.value})`);
    }

    public async read(device: DeviceModel, params: { name: string; value: number }): Promise<number> {
        throw new NotImplementedError(`ModbusSlaveStrategy.read is not implemented yet (deviceId: ${device._id})`);
    }
}
