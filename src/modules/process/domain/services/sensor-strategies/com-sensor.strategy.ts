import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../../errors/not-implemented.error';
import { SensorType } from '../../interfaces/sensor.interface';
import { ComSensorConfigModel, SensorModel } from '../../models/sensor.model';
import { SensorStrategy } from './sensor-strategy.interface';

@Injectable()
export class ComSensorStrategy implements SensorStrategy {
    public readonly type = SensorType.COM;

    // eslint-disable-next-line @typescript-eslint/require-await
    public async read(sensor: SensorModel): Promise<number> {
        const { comRequestId } = sensor.config as ComSensorConfigModel;
        throw new NotImplementedError(`ComSensorStrategy.read is not implemented yet (comRequestId: ${comRequestId})`);
    }
}
