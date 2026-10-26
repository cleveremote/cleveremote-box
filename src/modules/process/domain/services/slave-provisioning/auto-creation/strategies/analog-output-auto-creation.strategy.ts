import { Injectable } from '@nestjs/common';
import { DeviceKind } from '@process/domain/models/device.model';
import { AutoCreatedElements, AutoCreationStrategy } from '../auto-creation-strategy.interface';

@Injectable()
export class AnalogOutputAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [DeviceKind.ANALOG_OUTPUT_8_CH, DeviceKind.ANALOG_OUTPUT_8_CH_MA];

    // TODO: auto-création analog output non implémentée, le slave est créé seul
    public async build(): Promise<AutoCreatedElements> {
        return { actuators: [], cycles: [], sensors: [] };
    }
}
