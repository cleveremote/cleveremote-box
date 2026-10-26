import { Injectable } from '@nestjs/common';
import { DeviceKind } from '@process/domain/models/device.model';
import { AutoCreatedElements, AutoCreationStrategy } from '../auto-creation-strategy.interface';

@Injectable()
export class AnalogInputAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [DeviceKind.ANALOG_INPUT_8_CH];

    // TODO: auto-création analog input non implémentée, le slave est créé seul
    public async build(): Promise<AutoCreatedElements> {
        return { actuators: [], cycles: [], sensors: [] };
    }
}
