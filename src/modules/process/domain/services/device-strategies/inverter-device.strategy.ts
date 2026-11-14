import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { DeviceModel, DeviceKind } from '../../models/device.model';
import { DeviceStrategy } from './device-strategy.interface';
import { DeviceCommandService } from '../device-command.service';

@Injectable()
export class InverterDeviceStrategy implements DeviceStrategy {
    public readonly kind = DeviceKind.INVERTER_VEICHI_SI23_V1;

    public constructor(private deviceCommandService: DeviceCommandService) { }

    // paramètres variateur (DeviceCommand init) non encore appliqués
    public async init(device: DeviceModel): Promise<void> {
        await this.deviceCommandService.runInitCommands(device._id);
    }

    // commandes reset puis réapplique tous les paramètres variateur
    public async reset(device: DeviceModel): Promise<void> {
        await this.deviceCommandService.runResetCommands(device._id);
    }

    public async configure(device: DeviceModel): Promise<void> {
        throw new NotImplementedError(`InverterDeviceStrategy.configure is not implemented yet (deviceId: ${device._id})`);
    }

    public async write(device: DeviceModel, params: { name: string; value: number }): Promise<void> {
        throw new NotImplementedError(`InverterDeviceStrategy.write is not implemented yet (deviceId: ${device._id}, value: ${params.value})`);
    }

    public async read(device: DeviceModel, params: { name: string; value: number }): Promise<number> {
        throw new NotImplementedError(`InverterDeviceStrategy.read is not implemented yet (deviceId: ${device._id})`);
    }

}
