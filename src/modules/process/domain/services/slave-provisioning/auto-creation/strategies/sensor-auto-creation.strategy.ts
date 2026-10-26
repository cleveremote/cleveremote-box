import { Injectable } from '@nestjs/common';
import { DeviceKind } from '@process/domain/models/device.model';
import { AutoCreatedElements, AutoCreationStrategy } from '../auto-creation-strategy.interface';

// Capteurs Modbus ; une spécialisation par kind se fait en sortant ce kind vers sa propre stratégie
@Injectable()
export class SensorAutoCreationStrategy implements AutoCreationStrategy {
    public readonly kinds = [
        DeviceKind.FLOWMETER_V1,
        DeviceKind.PRESSURE_V1,
        DeviceKind.EC_METER_V1,
        DeviceKind.FLOWMETER_ULTRASONIC_V1,
        DeviceKind.TEMPERATURE_MOISTURE_V1
    ];

    // TODO: auto-création capteur non implémentée, le slave est créé seul
    public async build(): Promise<AutoCreatedElements> {
        return { actuators: [], cycles: [] };
    }
}
