import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { DeviceModel, DeviceKind } from '../../models/device.model';
import { DeviceStrategy } from './device-strategy.interface';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ComRequestConfigModel, ComRequestModel } from '@process/domain/models/com-request.model';
import { ModbusService } from '../modbus.service';
import { buildOverrideParams } from '@process/domain/utils/build-override-params.util';

@Injectable()
export class InverterDeviceStrategy implements DeviceStrategy {
    public readonly kind = DeviceKind.INVERTER;

    public constructor(private comRequestRepository: ComRequestRepository,
        private modbusService: ModbusService,
        private readonly logger: Logger
    ) { }

    public async init(device: DeviceModel): Promise<void> {
        const comRequests: ComRequestModel[] = await this.comRequestRepository.getComRequestsByDeviceIdAndTypes(device._id, [ComRequestType.INVERTER_WRITE]);
        for (let index = 0; index < comRequests.length; index++) {
            const comRequest = comRequests[index];
            if (comRequest.config.done) {
                continue;
            }
            const overrideParams: ComRequestConfigModel = { address: 0, params: { value: 0 } };
            try {
                await this.modbusService.execute(comRequest, buildOverrideParams(comRequest.config, overrideParams));
                comRequest.config.done = true;
                await this.comRequestRepository.save(comRequest);
            } catch (err) {
                this.logger.error({ comRequestId: comRequest._id, err: err.message }, 'inverter init write failed');
            }
        }
    }

    public async reset(device: DeviceModel): Promise<void> {
        const comRequests: ComRequestModel[] = await this.comRequestRepository.getComRequestsByDeviceIdAndTypes(device._id, [ComRequestType.INVERTER_WRITE]);
        for (let index = 0; index < comRequests.length; index++) {
            const comRequest = comRequests[index];
            const overrideParams: ComRequestConfigModel = { address: 0, params: { value: 0 } };
            try {
                await this.modbusService.execute(comRequest, buildOverrideParams(comRequest.config, overrideParams));
                comRequest.config.done = true;
                await this.comRequestRepository.save(comRequest);
            } catch (err) {
                this.logger.error({ comRequestId: comRequest._id, err: err.message }, 'inverter reset write failed');
            }
        }
    }

    public async configure(device: DeviceModel): Promise<void> {
        const t = await this.comRequestRepository.getComRequestsByDeviceIdAndTypes(device._id, [ComRequestType.INVERTER_WRITE]).then((comRequests) => {
            const t = comRequests;
        });
        throw new NotImplementedError(`InverterDeviceStrategy.configure is not implemented yet (deviceId: ${device._id})`);
    }

    public async write(device: DeviceModel, params: { name: string; value: number }): Promise<void> {
        throw new NotImplementedError(`InverterDeviceStrategy.write is not implemented yet (deviceId: ${device._id}, value: ${params.value})`);
    }

    public async read(device: DeviceModel, params: { name: string; value: number }): Promise<number> {
        throw new NotImplementedError(`InverterDeviceStrategy.read is not implemented yet (deviceId: ${device._id})`);
    }

}
