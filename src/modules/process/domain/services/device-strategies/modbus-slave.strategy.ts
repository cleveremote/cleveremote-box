import { Injectable } from '@nestjs/common';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { DeviceModel, DeviceKind } from '../../models/device.model';
import { DeviceStrategy } from './device-strategy.interface';
import { ModbusService } from '../modbus.service';
import { Logger } from 'nestjs-pino';
import { ComRequestConfigModel, ComRequestModel } from '@process/domain/models/com-request.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { buildOverrideParams } from '@process/domain/utils/build-override-params.util';

@Injectable()
export class ModbusSlaveStrategy implements DeviceStrategy {
    public readonly kind = DeviceKind.MODBUS_SLAVE;

    public constructor(private comRequestRepository: ComRequestRepository,
        private modbusService: ModbusService,
        private readonly logger: Logger
    ) { }

    public async init(device: DeviceModel): Promise<void> {
        const comRequests: ComRequestModel[] = await this.comRequestRepository.getComRequestsByDeviceIdAndTypes(device._id, [ComRequestType.DIGITAL_IO_INIT]);
        for (let index = 0; index < comRequests.length; index++) {
            const comRequest = comRequests[index];
            try {
                if (!comRequest.config?.done) {
                    await this.modbusService.execute(comRequest, comRequest.config);
                    comRequest.config.done = true;
                    await this.comRequestRepository.save(comRequest);
                }
            } catch (err) {
                this.logger.error({ comRequestId: comRequest._id, err: err.message }, 'inverter reset write failed');
            }
        }
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
