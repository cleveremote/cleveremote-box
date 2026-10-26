import { Injectable } from '@nestjs/common';
import { SensorType } from '../../interfaces/sensor.interface';
import { ComSensorConfigModel, SensorModel } from '../../models/sensor.model';
import { ReadResult, SensorStrategy } from './sensor-strategy.interface';
import { DeviceCommandService } from '../device-command.service';
import { outcomeValues } from '@process/domain/utils/device-command.util';

@Injectable()
export class ComSensorStrategy implements SensorStrategy {
    public readonly type = SensorType.COM;

    public constructor(private deviceCommandService: DeviceCommandService) { }

    // valeurs déjà décodées par la register map (formules, unités) ; name = champ, pour les sensors enfants (config.field)
    public async read(sensor: SensorModel): Promise<ReadResult> {
        const { commandId, deviceId, field } = sensor.config as ComSensorConfigModel;
        if (!commandId || !deviceId) {
            throw new Error(`ComSensorStrategy: sensor ${sensor._id} sans commandId ou deviceId`);
        }
        const outcome = await this.deviceCommandService.execute(commandId, deviceId);
        return outcomeValues(outcome, field).map(({ name, value, unit }) => ({ value, isFormated: true, unit: unit ?? '', name }));
    }
}
