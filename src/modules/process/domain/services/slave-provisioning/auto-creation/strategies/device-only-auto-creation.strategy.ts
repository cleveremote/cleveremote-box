import { Injectable } from '@nestjs/common';
import { DeviceKind } from '@process/domain/models/device.model';
import { AutoCreatedElements, AutoCreationStrategy } from '../auto-creation-strategy.interface';

// Repli du resolver pour tout kind sans stratégie dédiée (ex: MODBUS_SLAVE) : le slave est créé seul
@Injectable()
export class DeviceOnlyAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds: DeviceKind[] = [];

    public async build(): Promise<AutoCreatedElements> {
        return { actuators: [], cycles: [], sensors: [] };
    }
}
