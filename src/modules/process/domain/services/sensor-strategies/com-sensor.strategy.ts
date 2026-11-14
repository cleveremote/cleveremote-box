import { Injectable } from '@nestjs/common';
import { SensorType } from '../../interfaces/sensor.interface';
import { ComSensorConfigModel, SensorModel } from '../../models/sensor.model';
import { ReadResult, SensorStrategy } from './sensor-strategy.interface';
import { DeviceCommandService } from '../device-command.service';

@Injectable()
export class ComSensorStrategy implements SensorStrategy {
    public readonly type = SensorType.COM;

    public constructor(private deviceCommandService: DeviceCommandService) { }

    // valeurs déjà décodées par la register map (formules, unités), limitées à config.field sinon aux champs de la commande ;
    // name = champ, pour les sensors enfants (config.field)
    public async read(sensor: SensorModel): Promise<ReadResult> {
        const { commandId, deviceId, field } = sensor.config as ComSensorConfigModel;
        if (!commandId || !deviceId) {
            throw new Error(`ComSensorStrategy: sensor ${sensor._id} sans commandId ou deviceId`);
        }
        const values = await this.deviceCommandService.read(commandId, deviceId, field ? [field] : undefined);
        return values.map(({ name, value, unit }) => ({ value, isFormated: true, unit: unit ?? '', name }));
    }
}
