import { Injectable } from '@nestjs/common';
import { DeviceKind } from '@process/domain/models/device.model';
import { AutoCreatedElements, AutoCreationStrategy } from '../auto-creation-strategy.interface';

@Injectable()
export class InverterAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [DeviceKind.INVERTER_VEICHI_SI23_V1];

    // TODO: auto-création variateur non implémentée, le slave est créé seul
    public async build(): Promise<AutoCreatedElements> {
        return { actuators: [], cycles: [] };
    }
}
