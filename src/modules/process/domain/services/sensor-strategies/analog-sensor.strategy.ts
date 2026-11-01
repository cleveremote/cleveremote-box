import { Injectable } from '@nestjs/common';
import { SensorType } from '../../interfaces/sensor.interface';
import { AnalogSensorConfigModel, SensorModel } from '../../models/sensor.model';
import { toPhysicalValue } from '../../utils/analog-signal.util';
import { ReadResult, ReadResultItem, SensorStrategy } from './sensor-strategy.interface';
import { ComSensorStrategy } from './com-sensor.strategy';

@Injectable()
export class AnalogSensorStrategy implements SensorStrategy {
    public readonly type = SensorType.ANALOG;

    public constructor(private comSensorStrategy: ComSensorStrategy) { }

    // lecture identique à un sensor COM (valeur brute + unité de la voie), convertie en grandeur physique
    public async read(sensor: SensorModel,isFromLoopCtrl?:boolean): Promise<ReadResult> {
        const items = await this.comSensorStrategy.read(sensor);
        return items.map((item) => this.transform(sensor, item,isFromLoopCtrl));
    }

    // valeur brute (unité de l'acquisition, ex: µA) -> grandeur physique (config.scaling.unit) ; AnalogConversionError si invalide
    public transform(sensor: SensorModel, item: ReadResultItem, isFromLoopCtrl?:boolean): ReadResultItem {
        const { scaling } = sensor.config as AnalogSensorConfigModel;
        return { value: toPhysicalValue(item?.value, item?.unit, scaling,isFromLoopCtrl), isFormated: true, unit: scaling.unit, name: item.name };
    }
}
