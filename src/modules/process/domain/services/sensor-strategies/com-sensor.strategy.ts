import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { SensorType } from '../../interfaces/sensor.interface';
import { ComSensorConfigModel, SensorModel } from '../../models/sensor.model';
import { ReadResult, SensorStrategy } from './sensor-strategy.interface';
import { ModbusService } from '../modbus.service';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ComRequestConfigModel, ComRequestModel, ModbusExecuteResult, ModbusFunctionName } from '@process/domain/models/com-request.model';

@Injectable()
export class ComSensorStrategy implements SensorStrategy {
    public readonly type = SensorType.COM;

    public constructor(
        private modbusService: ModbusService,
        private comRequestRepository: ComRequestRepository
    ) { }

    public async read(sensor: SensorModel): Promise<ReadResult> {
        const { comRequestId } = sensor.config as ComSensorConfigModel;



        const comRequestData: ComRequestModel = await this.comRequestRepository.get(comRequestId) as ComRequestModel;

        const config = sensor.config as ComSensorConfigModel
        if (config.code && !sensor.parentId) { // it is a parent sensor
            const overrideParams: ComRequestConfigModel = { address: comRequestData.config.address + config.code, params: { length: 1 } }
            const res = await this.modbusService.execute(comRequestData, overrideParams) as ModbusExecuteResult | undefined;
            const unit = comRequestData.config.params?.unit ?? '';
            return this._extractValues(res).map((value) => ({
                value,
                isFormated: true,
                unit,
                name: comRequestData.name
            }));
        }
        const res = await this.modbusService.execute(comRequestData) as ModbusExecuteResult | undefined;
        return this._extractValues(res).map((value) => ({
            value,
            isFormated: false,
            name: comRequestData.name
        }));
    }

    private _extractValues(res: ModbusExecuteResult): number[] {
        switch (res.function) {
            case ModbusFunctionName.READ_HOLDING_REGISTERS:
            case ModbusFunctionName.READ_INPUT_REGISTERS:
                return res.result.data;
            case ModbusFunctionName.READ_COILS:
            case ModbusFunctionName.READ_DISCRETE_INPUTS:
                return res.result.data.map(Number);
            default:
                throw new NotImplementedError(`ComSensorStrategy: unsupported modbus function "${res.function}"`);
        }
    }
}
