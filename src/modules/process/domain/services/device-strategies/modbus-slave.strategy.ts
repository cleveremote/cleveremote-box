import { Injectable } from '@nestjs/common';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { DeviceModel, DeviceKind } from '../../models/device.model';
import { DeviceStrategy } from './device-strategy.interface';

@Injectable()
export class ModbusSlaveStrategy implements DeviceStrategy {
    public readonly kind = DeviceKind.MODBUS_SLAVE;

    public constructor(private comRequestRepository: ComRequestRepository) { }

    public async init(device: DeviceModel): Promise<void> {
        throw new NotImplementedError(`ModbusSlaveStrategy.init is not implemented yet (deviceId: ${device._id})`);
    }

    public async reset(device: DeviceModel): Promise<void> {
        throw new NotImplementedError(`ModbusSlaveStrategy.reset is not implemented yet (deviceId: ${device._id})`);
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
