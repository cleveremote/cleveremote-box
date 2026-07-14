import { Injectable } from '@nestjs/common';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { DeviceModel, DeviceKind } from '../../models/device.model';
import { DeviceStrategy } from './device-strategy.interface';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ComRequestConfigModel, ComRequestModel } from '@process/domain/models/com-request.model';
import { ModbusService } from '../modbus.service';

@Injectable()
export class InverterDeviceStrategy implements DeviceStrategy {
    public readonly kind = DeviceKind.INVERTER;

    public constructor(private comRequestRepository: ComRequestRepository,
        private modbusService: ModbusService
    ) { }

    public async init(device: DeviceModel): Promise<void> {
        throw new NotImplementedError(`InverterDeviceStrategy.init is not implemented yet (deviceId: ${device._id})`);
    }

    public async reset(device: DeviceModel): Promise<void> {
        const comRequests: ComRequestModel[] = await this.comRequestRepository.getComRequestsByDeviceIdAndTypes(device._id, [ComRequestType.INVERTER_WRITE]);
        for (let index = 0; index < comRequests.length; index++) {
            const comRequest = comRequests[index];
            
            const overrideParams: ComRequestConfigModel = {address: 0,params: {value: 0} }
            this.modbusService.execute(comRequest, this.buidOverrideParams(comRequest.config, overrideParams));
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

    private buidOverrideParams(params: ComRequestConfigModel, overrideParams: ComRequestConfigModel): ComRequestConfigModel {
        const overridedParams: ComRequestConfigModel = {
            address: overrideParams.address || params.address,
            function: overrideParams.function || params.function,
            disabled: overrideParams.disabled || params.disabled,
            params: {
                length: overrideParams.params?.length || params.params?.length,
                scale: overrideParams.params?.scale || params.params?.scale,
                unit: overrideParams.params?.unit || params.params?.unit,
                value: overrideParams.params?.value || params.params?.value,
                persistence: {
                    persist: overrideParams.params?.persistence?.persist ?? params.params?.persistence?.persist ?? false,
                    address: overrideParams.params?.persistence?.address ?? params.params?.persistence?.address ?? 0
                }
            }
        }; 
        return overridedParams;
    }
}
